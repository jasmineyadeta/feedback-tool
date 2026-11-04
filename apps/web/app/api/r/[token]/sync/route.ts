import { SyncRequest } from '@ft/shared';
import { notFound, ok, parseJson, rateLimit, tooMany } from '@/lib/server/http';
import { applySync, resolveInvite } from '@/lib/server/reviewer';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string }> };

/** Idempotent draft sync from the reviewer's IndexedDB queue. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`sync:${ctx.invite.id}`, 240, 600))) return tooMany();
    const p = await parseJson(req, SyncRequest);
    if (!p.ok) return p.res;
    return ok(await applySync(ctx, p.data.ops));
  });
}
