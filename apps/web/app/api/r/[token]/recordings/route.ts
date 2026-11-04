import { after } from 'next/server';
import { LIMITS, RecordingMeta } from '@ft/shared';
import { fail, notFound, ok, rateLimit, tooMany } from '@/lib/server/http';
import { resolveInvite } from '@/lib/server/reviewer';
import { createRecording, getRecordingRow, processRecording } from '@/lib/server/recordings';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string }> };

/** Multipart upload: `audio` (file) + `meta` (JSON). The browser keeps the audio until this ACKs. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`rec:${ctx.invite.id}`, 30, 3600))) return tooMany();
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > LIMITS.audioMaxBytes + 1_000_000)
      return fail(413, 'That recording is too long. Keep each one under 10 minutes.', 'size');
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail(
        400,
        'The upload didn’t arrive in one piece. It’s saved on your device — try again.',
        'bad_upload',
      );
    }
    const audio = form.get('audio');
    let raw: unknown = null;
    try {
      raw = JSON.parse(String(form.get('meta') ?? 'null'));
    } catch {
      raw = null;
    }
    const meta = RecordingMeta.safeParse(raw);
    if (!(audio instanceof Blob) || !meta.success)
      return fail(
        400,
        'The upload was incomplete. It’s saved on your device — try again.',
        'invalid',
      );
    const { duplicate } = await createRecording(
      ctx,
      meta.data,
      new Uint8Array(await audio.arrayBuffer()),
    );
    const row = await getRecordingRow(ctx.invite.id, meta.data.clientId);
    if (row) after(() => processRecording(row).then(() => undefined));
    return ok({ clientId: meta.data.clientId, duplicate }, duplicate ? 200 : 201);
  });
}
