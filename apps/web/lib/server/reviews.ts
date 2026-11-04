import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LIMITS, type Anchor } from '@ft/shared';
import { adminClient, userClient, viaApp } from './supabase';
import { validatePdf } from './pdf';
import { env } from './env';
import { logEvent } from './events';
import { proxyEnterUrl, validateSiteUrl } from './proxy';
import { screenshotService } from './adapters';
import {
  decideMode,
  headlessHealth,
  proxyFailureMessage,
  proxyHealth,
  SCREEN_WIDTHS,
} from './site-health';
import type { HealthReport, SiteScreen } from '../site-mode';

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

async function assertRoomForReview() {
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
}

export async function createPdfReview(ownerId: string, input: { title: string; context: string }) {
  await assertRoomForReview();
  const sb = await userClient();
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

/**
 * SPEC §3.1 website: validate the URL server-side, health-check through the proxy and headlessly,
 * choose live or Screenshot mode, and (Screenshot mode) store entry-page screenshots.
 */
export async function createSiteReview(
  ownerId: string,
  input: { url: string; title: string; context: string },
) {
  await assertRoomForReview();
  const chk = await validateSiteUrl(input.url);
  if (!chk.ok) throw new UserError(400, chk.message, chk.reason);
  const id = randomUUID();
  const path = `${chk.url.pathname}${chk.url.search}`;
  const enter = await proxyEnterUrl({ reviewId: id, siteUrl: chk.url, etld1: chk.etld1, path });
  const proxy = await proxyHealth(enter.token, path);
  if (!proxy.ok) throw new UserError(400, proxyFailureMessage(proxy), 'site_unreachable');
  const headless = await headlessHealth(enter.url);
  const { mode, reason } = decideMode(proxy, headless);
  const screens: SiteScreen[] = [];
  if (mode === 'screenshot') {
    const store = adminClient().storage.from('screenshots');
    try {
      for (const s of SCREEN_WIDTHS) {
        const png = await screenshotService().capture({ url: enter.url, ...s, fullPage: true });
        const key = `${ownerId}/${id}/entry-${s.width}.png`;
        const { error } = await store.upload(key, png, { contentType: 'image/png', upsert: true });
        if (error) throw error;
        screens.push({ width: s.width, key });
      }
    } catch {
      await removeObjects(screens.map((s) => ({ bucket: 'screenshots', path: s.key })));
      throw new UserError(
        400,
        'We couldn’t load your site, even as a screenshot. Check the address and try again.',
        'screenshot_failed',
      );
    }
  }
  const report: HealthReport = {
    checkedAt: new Date().toISOString(),
    mode,
    reason,
    platform: proxy.platform ?? 'unknown',
    proxy: { status: proxy.status ?? null, ms: proxy.ms ?? 0 },
    headless,
    screens,
  };
  const sb = await userClient();
  const { error } = await sb.from('reviews').insert({
    id,
    owner_id: ownerId,
    artifact_type: 'website',
    site_url: `${chk.url.origin}${chk.url.pathname}${chk.url.search}`,
    site_etld1: chk.etld1,
    title: input.title,
    context: input.context,
    render_mode: mode,
    health_report: report,
  });
  if (error) {
    await removeObjects(screens.map((s) => ({ bucket: 'screenshots', path: s.key })));
    throw error;
  }
  await logEvent(id, null, 'review_created', { artifact: 'website', mode, reason });
  return { id, mode };
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
  for (const s of (review.health_report as HealthReport | null)?.screens ?? [])
    objects.push({ bucket: 'screenshots', path: s.key });
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
  anchor: Anchor | null;
  anchor_source: 'tap' | 'ai' | 'viewport' | 'manual' | 'owner_moved' | null;
  page_path: string | null;
  screenshot_file_key: string | null;
  general: boolean;
  addressed_at: string | null;
  created_at: string;
  sort_key: number;
  recording_id: string | null;
  span_start_ms: number | null;
  span_end_ms: number | null;
  transcript_original: string | null;
};
export type FeedbackReviewer = { id: string; name: string; submitted_at: string };

/** RLS returns only comments whose invite is submitted (D20); owners can't see drafts. */
export async function listFeedback(reviewId: string) {
  const sb = await userClient();
  const [{ data: comments, error }, { data: invites, error: e2 }] = await Promise.all([
    sb
      .from('comments')
      .select(
        'id,invite_id,text,anchor,anchor_source,general,addressed_at,created_at,sort_key,recording_id,span_start_ms,span_end_ms,transcript_original,page_path,screenshot_file_key',
      )
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

/** Owner audio: RLS only returns recordings of submitted invites on the owner's own reviews. */
export async function ownerAudioUrl(reviewId: string, recordingId: string) {
  if (!isUuid(recordingId)) return { status: 'not_found' as const };
  const sb = await userClient();
  const { data } = await sb
    .from('recordings')
    .select('audio_file_key,invite:reviewer_invites!inner(review_id)')
    .eq('id', recordingId)
    .maybeSingle();
  const row = data as { audio_file_key: string | null; invite: { review_id: string } } | null;
  if (!row || row.invite.review_id !== reviewId) return { status: 'not_found' as const };
  if (!row.audio_file_key) return { status: 'purged' as const };
  const { data: signed } = await adminClient()
    .storage.from('audio')
    .createSignedUrl(row.audio_file_key, 3600);
  return signed
    ? { status: 'ok' as const, url: viaApp(signed.signedUrl) }
    : { status: 'not_found' as const };
}
