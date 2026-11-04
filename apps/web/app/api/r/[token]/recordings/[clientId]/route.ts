import { after } from 'next/server';
import { notFound, ok, rateLimit, tooMany } from '@/lib/server/http';
import { resolveInvite } from '@/lib/server/reviewer';
import { getRecordingRow, isDue, processRecording, recordingStatus } from '@/lib/server/recordings';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string; clientId: string }> };

/** Status poll. A due retry is kicked off here too, so retries happen while the reviewer waits. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { token, clientId } = await params;
    const ctx = await resolveInvite(token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`recpoll:${ctx.invite.id}`, 600, 600))) return tooMany();
    const row = await getRecordingRow(ctx.invite.id, clientId);
    if (!row) return notFound();
    if (isDue(row)) after(() => processRecording(row).then(() => undefined));
    return ok(await recordingStatus(ctx, clientId));
  });
}
