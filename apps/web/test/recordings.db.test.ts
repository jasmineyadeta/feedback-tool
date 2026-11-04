import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Timeline } from '@ft/shared';
import { adminClient, sbEnv, userClient } from './helpers/supabase';

vi.mock('server-only', () => ({}));

type Mod = typeof import('@/lib/server/recordings');
let rec: Mod;
let purge: typeof import('@/lib/server/jobs/purge');
let reviewer: typeof import('@/lib/server/reviewer');

beforeAll(async () => {
  const e = sbEnv();
  Object.assign(process.env, {
    SUPABASE_URL: e.url,
    SUPABASE_ANON_KEY: e.anon,
    SUPABASE_SERVICE_ROLE_KEY: e.service,
    MOCK_AI: '1',
  });
  (await import('@/lib/server/env')).resetEnvCache();
  rec = await import('@/lib/server/recordings');
  purge = await import('@/lib/server/jobs/purge');
  reviewer = await import('@/lib/server/reviewer');
});

/** A "webm" whose bytes carry the mock transcriber's script (see adapters/transcriber.ts). */
function fakeWebm(script: object): Uint8Array {
  const head = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const body = new TextEncoder().encode(`FT-TRANSCRIPT:${JSON.stringify(script)}FT-END`);
  return new Uint8Array([...head, ...body]);
}

const page = (n: number) => ({ kind: 'pdf-page' as const, page: n, visibleTextSample: '' });
const timeline = (tapMs?: number): Timeline => ({
  snapshots: [0, 1000, 2000, 3000, 4000].map((t) => ({
    t,
    pagePath: '/page/1',
    scrollY: 0,
    elements: [],
    viewportAnchor: page(1),
  })),
  taps:
    tapMs === undefined
      ? []
      : [
          {
            t: tapMs,
            eid: null,
            fullAnchor: {
              kind: 'pdf',
              page: 2,
              textQuote: null,
              rectPdf: { x: 1, y: 2, w: 0, h: 0 },
              point: { xPct: 0.5, yPct: 0.5 },
            },
          },
        ],
});

async function makeCtx() {
  const owner = await userClient();
  const admin = adminClient();
  const { data: review } = await admin
    .from('reviews')
    .insert({
      owner_id: owner.userId,
      artifact_type: 'pdf',
      title: 'T',
      pdf_file_key: `${owner.userId}/x.pdf`,
      pdf_page_count: 2,
    })
    .select('*')
    .single();
  const { data: invite } = await admin
    .from('reviewer_invites')
    .insert({
      review_id: review!.id,
      token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    })
    .select('id,review_id,name_hint,reviewer_name,status,submitted_at,revoked_at,created_at')
    .single();
  return { review, invite } as unknown as Parameters<Mod['createRecording']>[0];
}

const cid = () => randomUUID().replace(/-/g, '');

describe('recordings', () => {
  it('rejects bytes that are not the declared audio type', () => {
    expect(rec.sniffAudio(new TextEncoder().encode('<html>'), 'audio/webm')).toBe(false);
    expect(rec.sniffAudio(fakeWebm({}), 'audio/webm;codecs=opus')).toBe(true);
    expect(rec.sniffAudio(fakeWebm({}), 'audio/mp4')).toBe(false);
  });

  it('stores audio, transcribes, splits at the tap, and proposes draft comments', async () => {
    const ctx = await makeCtx();
    const clientId = cid();
    // 12 words, 0.4 s apart (mock evenlySpaced starts at 0.2 s); tap at 2.6 s → word 6
    const text = 'the opening summary reads well overall the second page needs more numbers please';
    await rec.createRecording(
      ctx,
      { clientId, mimeType: 'audio/webm;codecs=opus', durationMs: 5000, timeline: timeline(2600) },
      fakeWebm({ text }),
    );
    // Same upload again (retry after a lost ACK) is harmless.
    expect(
      (
        await rec.createRecording(
          ctx,
          { clientId, mimeType: 'audio/webm', durationMs: 5000, timeline: timeline(2600) },
          fakeWebm({ text }),
        )
      ).duplicate,
    ).toBe(true);

    const row = await rec.getRecordingRow(ctx.invite.id, clientId);
    expect(await rec.processRecording(row!)).toBe('ok');
    const st = await rec.recordingStatus(ctx, clientId);
    expect(st!.status).toBe('ok');
    expect(st!.proposed.map((p) => [p.source, p.text])).toEqual([
      ['viewport', 'The opening summary reads well overall'],
      ['tap', 'The second page needs more numbers please'],
    ]);
    expect(st!.proposed[1]!.anchor).toMatchObject({ kind: 'pdf', page: 2 });
    // Drafts aren't comments yet: not in the reviewer's list, and submit is blocked until accepted.
    expect(await reviewer.listInviteComments(ctx.invite.id)).toEqual([]);
    expect(await rec.openRecordings(ctx)).toEqual([clientId]);
  });

  it('transcription failure keeps the audio, stays pending with backoff, then gives up', async () => {
    const ctx = await makeCtx();
    const clientId = cid();
    await rec.createRecording(
      ctx,
      { clientId, mimeType: 'audio/webm', durationMs: 3000, timeline: timeline() },
      fakeWebm({ fail: true }),
    );
    const admin = adminClient();
    let row = (await rec.getRecordingRow(ctx.invite.id, clientId))!;
    expect(await rec.processRecording(row)).toBe('retry');
    row = (await rec.getRecordingRow(ctx.invite.id, clientId))!;
    expect(row.resolver_status).toBe('pending');
    expect(new Date(row.next_attempt_at!).getTime()).toBeGreaterThan(Date.now());
    expect(await rec.processRecording(row)).toBe('skipped'); // not due yet
    const st = await rec.recordingStatus(ctx, clientId);
    expect(st).toMatchObject({ status: 'pending', slow: true, attempts: 1 });

    for (let i = 1; i < rec.MAX_ATTEMPTS; i++) {
      await admin.from('recordings').update({ next_attempt_at: null }).eq('id', row.id);
      row = (await rec.getRecordingRow(ctx.invite.id, clientId))!;
      await rec.processRecording(row);
    }
    row = (await rec.getRecordingRow(ctx.invite.id, clientId))!;
    expect(row.resolver_status).toBe('failed');
    const file = await admin.storage.from('audio').download(row.audio_file_key!);
    expect(file.data?.size).toBeGreaterThan(0); // audio never lost
  });

  it('purge job deletes audio past its 90-day date and keeps the row', async () => {
    const ctx = await makeCtx();
    const clientId = cid();
    await rec.createRecording(
      ctx,
      { clientId, mimeType: 'audio/webm', durationMs: 3000, timeline: timeline() },
      fakeWebm({ text: 'one two three' }),
    );
    const admin = adminClient();
    const row = (await rec.getRecordingRow(ctx.invite.id, clientId))!;
    const key = row.audio_file_key!;
    expect(await purge.purgeExpiredAudio(new Date())).toBeGreaterThanOrEqual(0);
    expect((await rec.getRecordingRow(ctx.invite.id, clientId))!.audio_file_key).toBe(key); // not expired
    await admin
      .from('recordings')
      .update({ delete_audio_after: new Date(Date.now() - 1000).toISOString() })
      .eq('id', row.id);
    expect(await purge.purgeExpiredAudio(new Date())).toBeGreaterThanOrEqual(1);
    expect((await rec.getRecordingRow(ctx.invite.id, clientId))!.audio_file_key).toBeNull();
    const gone = await admin.storage.from('audio').download(key);
    expect(gone.data).toBeNull();
  });
});
