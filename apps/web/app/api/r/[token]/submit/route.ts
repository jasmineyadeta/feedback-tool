import { after } from 'next/server';
import { SubmitRequest } from '@ft/shared';
import { notFound, ok, parseJson, rateLimit, tooMany } from '@/lib/server/http';
import { resolveInvite, submitInvite } from '@/lib/server/reviewer';
import { handle } from '@/lib/server/route';
import { captureSubmissionScreens } from '@/lib/server/site-screens';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`submit:${ctx.invite.id}`, 10, 3600))) return tooMany();
    const p = await parseJson(req, SubmitRequest);
    if (!p.ok) return p.res;
    const res = await submitInvite(ctx, p.data);
    // Fallback screenshots for the owner (SPEC §4.1), after the response so submit stays fast.
    after(() => captureSubmissionScreens(ctx).catch(() => undefined));
    return ok(res);
  });
}
