import 'server-only';
import { LIMITS, type CommentDraft, type SyncOp } from '@ft/shared';
import { adminClient } from './supabase';
import { hashToken, signedPdfUrl, UserError, type InviteRow, type ReviewRow } from './reviews';
import { logEvent } from './events';
import { mailer } from './adapters';
import { env } from './env';

/**
 * Reviewer side. Reviewers have no account: the invite token in the URL is the credential.
 * Every query here uses the service role and is explicitly scoped by the resolved invite id.
 */
export type ReviewerCtx = { invite: InviteRow; review: ReviewRow };

export type ReviewerComment = CommentDraft & { updatedAt: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Revoked, deleted and unknown invites all return null so the page can't tell them apart. */
export async function resolveInvite(token: string): Promise<ReviewerCtx | null> {
  if (!TOKEN_RE.test(token)) return null;
  // Lookup is by SHA-256 of the token, so timing reveals nothing about the stored hash.
  const { data } = await adminClient()
    .from('reviewer_invites')
    .select(
      'id,review_id,name_hint,reviewer_name,status,submitted_at,revoked_at,created_at,review:reviews!inner(*)',
    )
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data) return null;
  const { review, ...invite } = data as unknown as InviteRow & {
    review: ReviewRow & { deleted_at: string | null };
  };
  if (invite.status === 'revoked' || review.deleted_at) return null;
  if (review.artifact_type === 'pdf' && !review.pdf_file_key) return null;
  return { invite, review };
}

export async function reviewerPdfUrl(ctx: ReviewerCtx) {
  return signedPdfUrl(ctx.review);
}

export async function listInviteComments(inviteId: string): Promise<ReviewerComment[]> {
  const { data, error } = await adminClient()
    .from('comments')
    .select('client_id,text,anchor,anchor_source,general,sort_key,updated_at')
    .eq('invite_id', inviteId)
    .eq('state', 'saved')
    .order('sort_key');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    clientId: r.client_id as string,
    text: r.text as string,
    anchor: (r.anchor as CommentDraft['anchor']) ?? null,
    general: r.general as boolean,
    source: (r.anchor_source as CommentDraft['source']) ?? undefined,
    sortKey: r.sort_key as number,
    updatedAt: r.updated_at as string,
  }));
}

function assertWritable(ctx: ReviewerCtx) {
  if (ctx.invite.status === 'submitted')
    throw new UserError(
      409,
      'This review was already submitted, so it can’t be changed.',
      'submitted',
    );
}

/** Apply idempotent ops; returns the clientIds the browser may drop from its queue. */
export async function applySync(ctx: ReviewerCtx, ops: SyncOp[]): Promise<{ acked: string[] }> {
  assertWritable(ctx);
  const admin = adminClient();
  const inviteId = ctx.invite.id;
  const upserts = new Map<string, CommentDraft>();
  const deletes = new Set<string>();
  const merges = ops.filter((o): o is Extract<SyncOp, { op: 'merge' }> => o.op === 'merge');
  for (const m of merges) await mergeDraft(inviteId, m.from, m.into);
  for (const op of ops) {
    if (op.op === 'merge') continue;
    if (op.op === 'upsert') {
      upserts.set(op.comment.clientId, op.comment);
      deletes.delete(op.comment.clientId);
    } else {
      deletes.add(op.clientId);
      upserts.delete(op.clientId);
    }
  }
  for (const c of upserts.values())
    if (c.anchor && ctx.review.pdf_page_count && c.anchor.page > ctx.review.pdf_page_count)
      throw new UserError(400, 'That comment points at a page that doesn’t exist.', 'invalid');

  if (deletes.size) {
    const { error } = await admin
      .from('comments')
      .delete()
      .eq('invite_id', inviteId)
      .in('client_id', [...deletes]);
    if (error) throw error;
  }
  if (upserts.size) {
    const { data: existing, error: e1 } = await admin
      .from('comments')
      .select('client_id')
      .eq('invite_id', inviteId);
    if (e1) throw e1;
    const have = new Set((existing ?? []).map((r) => r.client_id as string));
    const added = [...upserts.keys()].filter((id) => !have.has(id)).length;
    if (have.size + added > LIMITS.commentsPerSubmission)
      throw new UserError(
        409,
        `You can leave up to ${LIMITS.commentsPerSubmission} comments. Combine a few, then try again.`,
        'limit',
      );
    const rows = [...upserts.values()].map((c) => ({
      invite_id: inviteId,
      review_id: ctx.review.id,
      client_id: c.clientId,
      text: c.text,
      anchor: c.general ? null : c.anchor,
      anchor_source: c.anchor && !c.general ? (c.source ?? 'manual') : null,
      pdf_page: c.anchor && !c.general ? c.anchor.page : null,
      general: c.general,
      sort_key: c.sortKey,
      state: 'saved',
    }));
    const { error } = await admin
      .from('comments')
      .upsert(rows, { onConflict: 'invite_id,client_id' });
    if (error) throw error;
    if (ctx.invite.status === 'not_started') {
      const { data: moved } = await admin
        .from('reviewer_invites')
        .update({ status: 'in_progress' })
        .eq('id', inviteId)
        .eq('status', 'not_started')
        .select('id');
      if (moved?.length) await logEvent(ctx.review.id, inviteId, 'first_comment_saved', {});
    }
  }
  return { acked: [...upserts.keys(), ...deletes, ...merges.map((m) => m.from)] };
}

/**
 * Join a recording draft into another (preview "Merge with previous"). The server combines the
 * original transcripts and time spans itself, so the owner's "original transcript" stays trustworthy.
 * Idempotent: once `from` is gone, a retried op does nothing.
 */
async function mergeDraft(inviteId: string, from: string, into: string) {
  if (from === into) return;
  const admin = adminClient();
  const { data } = await admin
    .from('comments')
    .select('client_id,state,transcript_original,span_start_ms,span_end_ms')
    .eq('invite_id', inviteId)
    .in('client_id', [from, into]);
  const src = data?.find((r) => r.client_id === from);
  const dst = data?.find((r) => r.client_id === into);
  if (!src || src.state !== 'draft') return;
  if (dst) {
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    const starts = [num(dst.span_start_ms), num(src.span_start_ms)].filter((v) => v !== null);
    const ends = [num(dst.span_end_ms), num(src.span_end_ms)].filter((v) => v !== null);
    const { error } = await admin
      .from('comments')
      .update({
        transcript_original: [dst.transcript_original, src.transcript_original]
          .filter(Boolean)
          .join(' ')
          .slice(0, 20_000),
        span_start_ms: starts.length ? Math.min(...starts) : null,
        span_end_ms: ends.length ? Math.max(...ends) : null,
      })
      .eq('invite_id', inviteId)
      .eq('client_id', into);
    if (error) throw error;
  }
  const { error } = await admin
    .from('comments')
    .delete()
    .eq('invite_id', inviteId)
    .eq('client_id', from)
    .eq('state', 'draft');
  if (error) throw error;
}

export async function submitInvite(ctx: ReviewerCtx, input: { name: string; email: string }) {
  assertWritable(ctx);
  const admin = adminClient();
  const { count } = await admin
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('invite_id', ctx.invite.id)
    .eq('state', 'saved');
  if (!count)
    throw new UserError(400, 'Add at least one comment or a general note first.', 'empty');
  const { count: drafts } = await admin
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('invite_id', ctx.invite.id)
    .eq('state', 'draft');
  if (drafts)
    throw new UserError(
      409,
      'Check the comments from your recording first, then tap “Looks good”.',
      'drafts',
    );
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('reviewer_invites')
    .update({
      status: 'submitted',
      submitted_at: now,
      reviewer_name: input.name,
      reviewer_email: input.email,
    })
    .eq('id', ctx.invite.id)
    .neq('status', 'submitted')
    .neq('status', 'revoked')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new UserError(409, 'This review was already submitted.', 'submitted');
  await logEvent(ctx.review.id, ctx.invite.id, 'submitted', { comments: count });
  await notifyOwner(ctx, input.name).catch((e) =>
    console.error('owner notification failed', e instanceof Error ? e.name : 'unknown'),
  );
  return { submittedAt: now };
}

/** Email the owner. No comment content in the email — they read it in the app. */
async function notifyOwner(ctx: ReviewerCtx, reviewerName: string) {
  const { data } = await adminClient().auth.admin.getUserById(ctx.review.owner_id);
  const to = data.user?.email;
  if (!to) return;
  const link = `${env().APP_ORIGIN}/reviews/${ctx.review.id}/feedback`;
  const title = ctx.review.title || 'your PDF';
  await mailer().send({
    to,
    subject: `${reviewerName} sent feedback on ${title}`,
    text: `${reviewerName} finished reviewing ${title}.\n\nRead their feedback: ${link}\n`,
  });
}
