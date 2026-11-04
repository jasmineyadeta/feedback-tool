import 'server-only';
import {
  baseMime,
  isAllowedAudioMime,
  LIMITS,
  type Anchor,
  type ProposedComment,
  type RecordingMeta,
  type RecordingStatus,
  type Timeline,
  type TranscriptWord,
} from '@ft/shared';
import { adminClient } from './supabase';
import { UserError } from './reviews';
import type { ReviewerCtx } from './reviewer';
import { anchorResolver, transcriber } from './adapters';
import { logEvent } from './events';
import { resolveWithAI } from './resolve';

/**
 * Talk-through recordings (SPEC §3.2 steps 3–5, §5). The audio is stored before anything else
 * happens, so a failed transcription never loses it; processing retries with backoff.
 */
const BACKOFF_S = [15, 60, 300, 900, 3600, 3 * 3600];
export const MAX_ATTEMPTS = BACKOFF_S.length + 1;
const LEASE_S = 120; // a claimed attempt that crashes becomes due again after this
const SLOW_MS = 60_000;

type RecordingRow = {
  id: string;
  invite_id: string;
  client_id: string;
  audio_file_key: string | null;
  mime_type: string;
  duration_ms: number;
  timeline: Timeline | null;
  resolver_status: 'pending' | 'ok' | 'rejected' | 'failed';
  attempts: number;
  next_attempt_at: string | null;
  created_at: string;
};
const COLS =
  'id,invite_id,client_id,audio_file_key,mime_type,duration_ms,timeline,resolver_status,attempts,next_attempt_at,created_at';

/** Check the bytes really are the declared audio container (don't trust the browser's label). */
export function sniffAudio(b: Uint8Array, mime: string): boolean {
  const m = baseMime(mime);
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (m === 'audio/webm') return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  if (m === 'audio/mp4') return ascii(4, 8) === 'ftyp';
  if (m === 'audio/wav') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  if (m === 'audio/mpeg')
    return ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0);
  return false;
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

function checkTimeline(ctx: ReviewerCtx, t: Timeline) {
  const pages = ctx.review.pdf_page_count ?? 0;
  const ok = (a: Anchor) =>
    ctx.review.artifact_type === 'pdf'
      ? (a.kind === 'pdf' || a.kind === 'pdf-page') && a.page <= pages
      : a.kind !== 'pdf' && a.kind !== 'pdf-page';
  const all = [
    ...t.taps.map((x) => x.fullAnchor),
    ...t.snapshots.flatMap((s) => [
      s.viewportAnchor,
      ...s.elements.flatMap((e) => (e.anchor ? [e.anchor] : [])),
    ]),
  ];
  if (!all.every(ok))
    throw new UserError(400, 'This recording points at pages that don’t exist.', 'invalid');
}

/** Store audio + timeline. Idempotent per (invite, clientId) so a retried upload is harmless. */
export async function createRecording(ctx: ReviewerCtx, meta: RecordingMeta, audio: Uint8Array) {
  if (ctx.invite.status === 'submitted')
    throw new UserError(409, 'This review was already submitted.', 'submitted');
  if (!isAllowedAudioMime(meta.mimeType) || !sniffAudio(audio, meta.mimeType))
    throw new UserError(
      400,
      'That recording format isn’t supported. Try typing instead.',
      'format',
    );
  if (!audio.length || audio.length > LIMITS.audioMaxBytes)
    throw new UserError(400, 'That recording is too long. Keep each one under 10 minutes.', 'size');
  checkTimeline(ctx, meta.timeline);

  const admin = adminClient();
  const existing = await admin
    .from('recordings')
    .select('id')
    .eq('invite_id', ctx.invite.id)
    .eq('client_id', meta.clientId)
    .maybeSingle();
  if (existing.data) return { id: existing.data.id as string, duplicate: true };

  const mime = baseMime(meta.mimeType);
  const key = `${ctx.review.owner_id}/${ctx.review.id}/${ctx.invite.id}/${meta.clientId}.${EXT[mime]}`;
  const up = await admin.storage
    .from('audio')
    .upload(key, audio, { contentType: mime, upsert: true });
  if (up.error) throw up.error;
  const { data, error } = await admin
    .from('recordings')
    .insert({
      invite_id: ctx.invite.id,
      client_id: meta.clientId,
      audio_file_key: key,
      mime_type: mime,
      duration_ms: Math.min(meta.durationMs, LIMITS.recordingMaxMs),
      timeline: meta.timeline,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { id: '', duplicate: true }; // raced with itself
    throw error;
  }
  return { id: data.id as string, duplicate: false };
}

async function getRow(inviteId: string, clientId: string): Promise<RecordingRow | null> {
  const { data } = await adminClient()
    .from('recordings')
    .select(COLS)
    .eq('invite_id', inviteId)
    .eq('client_id', clientId)
    .maybeSingle();
  return (data as RecordingRow) ?? null;
}

export function isDue(r: RecordingRow, now = Date.now()) {
  return (
    r.resolver_status === 'pending' &&
    (!r.next_attempt_at || new Date(r.next_attempt_at).getTime() <= now)
  );
}

/**
 * One processing attempt. Claimed with an optimistic lock on `attempts`, so concurrent callers
 * (upload handler, status poll, jobs runner) never process the same recording twice.
 */
export async function processRecording(
  r: RecordingRow,
): Promise<'ok' | 'retry' | 'failed' | 'skipped'> {
  if (!isDue(r) || !r.audio_file_key) return 'skipped';
  const admin = adminClient();
  const attempts = r.attempts + 1;
  const claim = await admin
    .from('recordings')
    .update({ attempts, next_attempt_at: new Date(Date.now() + LEASE_S * 1000).toISOString() })
    .eq('id', r.id)
    .eq('attempts', r.attempts)
    .eq('resolver_status', 'pending')
    .select('id');
  if (!claim.data?.length) return 'skipped';

  try {
    const file = await admin.storage.from('audio').download(r.audio_file_key);
    if (file.error || !file.data) throw new Error('audio missing');
    const { text, words } = await transcriber().transcribe(
      new Uint8Array(await file.data.arrayBuffer()),
      r.mime_type,
    );
    // LLM down/slow → retry the whole attempt; from the 3rd attempt on, place comments without AI
    // ("On screen") rather than keep the reviewer waiting.
    const { proposed, stats } = await resolveWithAI(
      r.client_id,
      words,
      r.timeline ?? { snapshots: [], taps: [] },
      anchorResolver(),
      { fallbackOnError: attempts >= 3 },
    );
    await saveProposals(r, proposed);
    await admin
      .from('recordings')
      .update({
        transcript_text: text.slice(0, 50_000),
        transcript_words: words as TranscriptWord[],
        resolver_status: 'ok',
        next_attempt_at: null,
      })
      .eq('id', r.id);
    const { data: inv } = await admin
      .from('reviewer_invites')
      .select('review_id')
      .eq('id', r.invite_id)
      .single();
    if (inv) {
      await logEvent(inv.review_id as string, r.invite_id, 'recording_transcribed', {
        durationMs: r.duration_ms,
        comments: proposed.length,
        aiSegments: stats.asked,
      });
      for (const reason of stats.rejected)
        await logEvent(inv.review_id as string, r.invite_id, 'ai_anchor_rejected', { reason });
    }
    return 'ok';
  } catch (e) {
    console.error('recording attempt failed', attempts, e instanceof Error ? e.name : 'unknown');
    const failed = attempts >= MAX_ATTEMPTS;
    await admin
      .from('recordings')
      .update({
        resolver_status: failed ? 'failed' : 'pending',
        next_attempt_at: failed
          ? null
          : new Date(Date.now() + BACKOFF_S[attempts - 1]! * 1000).toISOString(),
      })
      .eq('id', r.id);
    return failed ? 'failed' : 'retry';
  }
}

/** Proposals are `draft` comments until the reviewer accepts them ("Looks good"). If the reviewer
 *  already submitted (transcription was slow), they're saved directly so nothing is lost. */
async function saveProposals(r: RecordingRow, proposed: ProposedComment[]) {
  if (!proposed.length) return;
  const admin = adminClient();
  const { data: inv } = await admin
    .from('reviewer_invites')
    .select('review_id,status')
    .eq('id', r.invite_id)
    .single();
  if (!inv) return;
  const base = new Date(r.created_at).getTime();
  const rows = proposed.map((p, i) => ({
    invite_id: r.invite_id,
    review_id: inv.review_id,
    recording_id: r.id,
    client_id: p.clientId,
    text: p.text.slice(0, LIMITS.commentMaxChars),
    transcript_original: p.transcriptOriginal,
    span_start_ms: p.startMs,
    span_end_ms: p.endMs,
    anchor: p.anchor,
    anchor_source: p.source,
    pdf_page: p.anchor && 'page' in p.anchor ? p.anchor.page : null,
    state: inv.status === 'submitted' ? 'saved' : 'draft',
    sort_key: base + i,
  }));
  const { error } = await admin
    .from('comments')
    .upsert(rows, { onConflict: 'invite_id,client_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function recordingStatus(
  ctx: ReviewerCtx,
  clientId: string,
): Promise<RecordingStatus | null> {
  const r = await getRow(ctx.invite.id, clientId);
  if (!r) return null;
  const status =
    r.resolver_status === 'failed' ? 'failed' : r.resolver_status === 'pending' ? 'pending' : 'ok';
  let proposed: ProposedComment[] = [];
  if (status === 'ok') {
    const { data } = await adminClient()
      .from('comments')
      .select('client_id,text,transcript_original,anchor,anchor_source,span_start_ms,span_end_ms')
      .eq('recording_id', r.id)
      .eq('state', 'draft')
      .order('sort_key');
    proposed = (data ?? []).map((c) => ({
      clientId: c.client_id as string,
      text: c.text as string,
      transcriptOriginal: (c.transcript_original as string) ?? '',
      anchor: (c.anchor as Anchor) ?? null,
      source: c.anchor_source as ProposedComment['source'],
      startMs: (c.span_start_ms as number) ?? 0,
      endMs: (c.span_end_ms as number) ?? 0,
    }));
  }
  return {
    clientId,
    status,
    attempts: r.attempts,
    slow:
      status === 'pending' &&
      (r.attempts > 0 || Date.now() - new Date(r.created_at).getTime() > SLOW_MS),
    proposed,
  };
}

/** Recordings of this invite that still need the reviewer: pending, or waiting for "Looks good". */
export async function openRecordings(ctx: ReviewerCtx): Promise<string[]> {
  const admin = adminClient();
  const { data: recs } = await admin
    .from('recordings')
    .select('id,client_id,resolver_status')
    .eq('invite_id', ctx.invite.id)
    .order('created_at');
  const { data: drafts } = await admin
    .from('comments')
    .select('recording_id')
    .eq('invite_id', ctx.invite.id)
    .eq('state', 'draft');
  const withDrafts = new Set((drafts ?? []).map((d) => d.recording_id as string));
  return (recs ?? [])
    .filter((r) => r.resolver_status === 'pending' || withDrafts.has(r.id as string))
    .map((r) => r.client_id as string);
}

export async function getRecordingRow(inviteId: string, clientId: string) {
  return getRow(inviteId, clientId);
}

/** Jobs runner: everything due, oldest first. */
export async function processDue(limit = 10) {
  const { data } = await adminClient()
    .from('recordings')
    .select(COLS)
    .eq('resolver_status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at')
    .limit(limit);
  const results: string[] = [];
  for (const r of (data ?? []) as RecordingRow[]) results.push(await processRecording(r));
  return results;
}
