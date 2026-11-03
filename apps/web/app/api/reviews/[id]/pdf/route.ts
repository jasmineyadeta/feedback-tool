import { currentUser } from '@/lib/server/supabase';
import { notFound, ok, rateLimit, tooMany, unauthorized } from '@/lib/server/http';
import { finalizePdf, getReview } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

/** Called after the browser uploaded to the signed URL. Validates and attaches the PDF. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();
    const review = await getReview((await params).id);
    if (!review || review.artifact_type !== 'pdf') return notFound();
    if (!(await rateLimit(`upload:${user.id}`, 20, 3600))) return tooMany();
    return ok(await finalizePdf(review));
  });
}
