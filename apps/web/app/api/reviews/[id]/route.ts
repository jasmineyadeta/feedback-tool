import { z } from 'zod';
import { currentUser } from '@/lib/server/supabase';
import { fail, notFound, ok, parseJson, unauthorized } from '@/lib/server/http';
import { deleteReview, getReview } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

const Del = z.object({ confirm: z.string() });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const review = await getReview((await params).id);
    if (!review) return notFound();
    const p = await parseJson(req, Del);
    if (!p.ok) return p.res;
    if (p.data.confirm.trim().toLowerCase() !== 'delete')
      return fail(400, 'Type "delete" to confirm.', 'confirm');
    await deleteReview(review);
    return ok({ deleted: true });
  });
}
