import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LIMITS, type PdfAnchor } from '@ft/shared';
import { adminClient, userClient, viaApp } from './supabase';
import { validatePdf } from './pdf';
import { env } from './env';
import { logEvent } from './events';

export type ReviewRow = {
  id: string;
  owner_id: string;
  artifact_type: 'website' | 'pdf';
  site_url: string | null;
  site_etld1: string | null;
  pdf_file_key: string | null;
  pdf_page_count: number | null;
  title: string;
  context: string;
  render_mode: 'live' | 'screenshot' | null;
  health_report: unknown;
  created_at: string;
};
export type InviteRow = {
  id: string;
  review_id: string;
  name_hint: string;
  reviewer_name: string | null;
  status: 'not_started' | 'in_progress' | 'submitted' | 'revoked';
  submitted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
const INVITE_COLS =
  'id,review_id,name_hint,reviewer_name,status,submitted_at,revoked_at,created_at';

export class UserError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- reviews (owner, RLS)
export async function listReviews(): Promise<ReviewRow[]> {
  const sb = await userClient();
  const { data, error } = await sb
    .from('reviews')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ReviewRow[];
}

export async function getReview(id: string): Promise<ReviewRow | null> {
  if (!isUuid(id)) return null;
  const sb = await userClient();
  const { data } = await sb
    .from('reviews')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as ReviewRow) ?? null;
}

export async function createPdfReview(ownerId: string, input: { title: string; context: string }) {
  const sb = await userClient();
  const { count } = await sb
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  if ((count ?? 0) >= LIMITS.reviewsPerOwner)
    throw new UserError(
      409,
      `You can have up to ${LIMITS.reviewsPerOwner} reviews during the pilot. Delete one to make room.`,
      'limit',
    );
  const id = randomUUID();
  const key = `${ownerId}/${id}.pdf`;
  const { error } = await sb.from('reviews').insert({
    id,
    owner_id: ownerId,
    artifact_type: 'pdf',
    title: input.title,
    context: input.context,
  });
  if (error) throw error;
  const up = await adminClient().storage.from('pdfs').createSignedUploadUrl(key, { upsert: true });
  if (up.error) throw up.error;
  await logEvent(id, null, 'review_created', { artifact: 'pdf' });
  return { id, upload: { url: viaApp(up.data.signedUrl) } };
}

/** After the browser uploads to the signed URL: validate server-side, then attach to the review. */
export async function finalizePdf(review: ReviewRow) {
  const key = `${review.owner_id}/${review.id}.pdf`;
  const store = adminClient().storage.from('pdfs');
  const { data, error } = await store.download(key);
  if (error || !data)
    throw new UserError(400, "We didn't receive the file. Upload it again.", 'missing_upload');
  const check = await validatePdf(new Uint8Array(await data.arrayBuffer()));
  if (!check.ok) {
    await store.remove([key]);
    throw new UserError(400, check.message, check.code);
  }
  const sb = await userClient();
  const { error: e2 } = await sb
    .from('reviews')
    .update({ pdf_file_key: key, pdf_page_count: check.pages })
    .eq('id', review.id);
  if (e2) throw e2;
  return { pages: check.pages };
}

export async function signedPdfUrl(review: ReviewRow): Promise<string | null> {
  if (!review.pdf_file_key) return null;
  const { data } = await adminClient()
    .storage.from('pdfs')
    .createSignedUrl(review.pdf_file_key, 600);
  return data ? viaApp(data.signedUrl) : null;
}

/** Hard delete: storage first (queue failures for retry), then rows (cascade). SPEC §2 deletion. */
export async function deleteReview(review: ReviewRow) {
  const admin = adminClient();
  const objects: { bucket: string; path: string }[] = [];
  if (review.pdf_file_key) objects.push({ bucket: 'pdfs', path: review.pdf_file_key });
  const { data: invites } = await admin
    .from('reviewer_invites')
    .select('id')
    .eq('review_id', review.id);
  const inviteIds = (invites ?? []).map((i) => i.id as string);
  if (inviteIds.length) {
    const { data: recs } = await admin
      .from('recordings')
      .select('audio_file_key')
      .in('invite_id', inviteIds)
      .not('audio_file_key', 'is', null);
    for (const r of recs ?? []) objects.push({ bucket: 'audio', path: r.audio_file_key as string });
  }
  const { data: shots } = await admin
    .from('comments')
    .select('screenshot_file_key')
    .eq('review_id', review.id)
    .not('screenshot_file_key', 'is', null);
  for (const s of shots ?? [])
    objects.push({ bucket: 'screenshots', path: s.screenshot_file_key as string });
  await removeObjects(objects);
  const { error } = await admin
    .from('reviews')
    .delete()
    .eq('id', review.id)
    .eq('owner_id', review.owner_id);
  if (error) throw error;
}

export async function removeObjects(objects: { bucket: string; path: string }[]) {
  const admin = adminClient();
  const byBucket = new Map<string, string[]>();
  for (const o of objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path]);
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error)
      await admin.from('storage_deletions').insert(paths.map((path) => ({ bucket, path })));
  }
}

// ---------------------------------------------------------------- invites
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function inviteLink(token: string): string {
  return `${env().APP_ORIGIN}/r/${token}`;
}

export async function listInvites(reviewId: string): Promise<InviteRow[]> {
  const sb = await userClient();
  const { data, error } = await sb
    .from('reviewer_invites')
    .select(INVITE_COLS)
    .eq('review_id', reviewId)
    .order('created_at');
  if (error) throw error;
  return data as InviteRow[];
}

export async function createInvite(review: ReviewRow, nameHint: string) {
  const sb = await userClient();
  const { count } = await sb
    .from('reviewer_invites')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', review.id);
  if ((count ?? 0) >= LIMITS.invitesPerReview)
    throw new UserError(
      409,
      `A review can have up to ${LIMITS.invitesPerReview} reviewer links.`,
      'limit',
    );
  const { token, hash } = newInviteToken();
  const { data, error } = await sb
    .from('reviewer_invites')
    .insert({ review_id: review.id, token_hash: hash, name_hint: nameHint })
    .select(INVITE_COLS)
    .single();
  if (error) throw error;
  await logEvent(review.id, (data as InviteRow).id, 'invite_created', {});
  return { invite: data as InviteRow, link: inviteLink(token) };
}

export async function getOwnedInvite(inviteId: string): Promise<InviteRow | null> {
  if (!isUuid(inviteId)) return null;
  const sb = await userClient();
  const { data } = await sb
    .from('reviewer_invites')
    .select(INVITE_COLS)
    .eq('id', inviteId)
    .maybeSingle();
  return (data as InviteRow) ?? null;
}

export async function revokeInvite(inviteId: string) {
  const sb = await userClient();
  const { error } = await sb
    .from('reviewer_invites')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}

export async function deleteInvite(invite: InviteRow) {
  const admin = adminClient();
  const { data: recs } = await admin
    .from('recordings')
    .select('audio_file_key')
    .eq('invite_id', invite.id)
    .not('audio_file_key', 'is', null);
  const { data: shots } = await admin
    .from('comments')
    .select('screenshot_file_key')
    .eq('invite_id', invite.id)
    .not('screenshot_file_key', 'is', null);
  await removeObjects([
    ...(recs ?? []).map((r) => ({ bucket: 'audio', path: r.audio_file_key as string })),
    ...(shots ?? []).map((s) => ({ bucket: 'screenshots', path: s.screenshot_file_key as string })),
  ]);
  const sb = await userClient();
  const { error } = await sb.from('reviewer_invites').delete().eq('id', invite.id);
  if (error) throw error;
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ---------------------------------------------------------------- feedback (owner, RLS: submitted only)
export type FeedbackComment = {
  id: string;
  invite_id: string;
  text: string;
  anchor: PdfAnchor | null;
  general: boolean;
  addressed_at: string | null;
  created_at: string;
  sort_key: number;
};
export type FeedbackReviewer = { id: string; name: string; submitted_at: string };

/** RLS returns only comments whose invite is submitted (D20); owners can't see drafts. */
export async function listFeedback(reviewId: string) {
  const sb = await userClient();
  const [{ data: comments, error }, { data: invites, error: e2 }] = await Promise.all([
    sb
      .from('comments')
      .select('id,invite_id,text,anchor,general,addressed_at,created_at,sort_key')
      .eq('review_id', reviewId)
      .eq('state', 'saved')
      .order('sort_key'),
    sb
      .from('reviewer_invites')
      .select('id,reviewer_name,name_hint,submitted_at')
      .eq('review_id', reviewId)
      .eq('status', 'submitted')
      .order('submitted_at'),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const reviewers: FeedbackReviewer[] = (invites ?? []).map((i) => ({
    id: i.id as string,
    name: (i.reviewer_name as string | null) || (i.name_hint as string) || 'Reviewer',
    submitted_at: i.submitted_at as string,
  }));
  return { comments: (comments ?? []) as FeedbackComment[], reviewers };
}

export async function setAddressed(commentId: string, addressed: boolean) {
  if (!isUuid(commentId)) return null;
  const sb = await userClient();
  const { data, error } = await sb
    .from('comments')
    .update({ addressed_at: addressed ? new Date().toISOString() : null })
    .eq('id', commentId)
    .select('id,review_id,invite_id,addressed_at');
  if (error) throw error;
  return (
    (data?.[0] as {
      id: string;
      review_id: string;
      invite_id: string;
      addressed_at: string | null;
    }) ?? null
  );
}
