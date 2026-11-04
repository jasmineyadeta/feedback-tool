import { notFound, ok, rateLimit, tooMany } from '@/lib/server/http';
import { resolveInvite, reviewerPdfUrl } from '@/lib/server/reviewer';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string }> };

/** A fresh short-lived signed URL for the PDF (the one in the page HTML expires after 10 minutes). */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    if (!(await rateLimit(`pdf:${ctx.invite.id}`, 60, 600))) return tooMany();
    const url = await reviewerPdfUrl(ctx);
    return url ? ok({ url }) : notFound();
  });
}
