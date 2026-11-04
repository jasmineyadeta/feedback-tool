import { currentUser } from '@/lib/server/supabase';
import { fail, notFound, ok, unauthorized } from '@/lib/server/http';
import { getReview, ownerAudioUrl } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ id: string; recId: string }> };

/** Short-lived signed URL for the owner to play a reviewer's recording. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const { id, recId } = await params;
    const review = await getReview(id);
    if (!review) return notFound();
    const r = await ownerAudioUrl(review.id, recId);
    if (r.status === 'purged')
      return fail(410, 'This recording was deleted after 90 days. The words are kept.', 'purged');
    if (r.status !== 'ok') return notFound();
    return ok({ url: r.url });
  });
}
