import { SubmitRequest } from '@ft/shared';
import { notFound, ok, parseJson, rateLimit, tooMany } from '@/lib/server/http';
import { resolveInvite, submitInvite } from '@/lib/server/reviewer';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`submit:${ctx.invite.id}`, 10, 3600))) return tooMany();
    const p = await parseJson(req, SubmitRequest);
    if (!p.ok) return p.res;
    return ok(await submitInvite(ctx, p.data));
  });
}
