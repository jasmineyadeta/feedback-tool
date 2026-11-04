import { z } from 'zod';
import { currentUser } from '@/lib/server/supabase';
import { notFound, ok, parseJson, unauthorized } from '@/lib/server/http';
import { getReview, setAddressed } from '@/lib/server/reviews';
import { logEvent } from '@/lib/server/events';
import { handle } from '@/lib/server/route';

const Patch = z.object({ addressed: z.boolean() });
type Ctx = { params: Promise<{ id: string; cid: string }> };

/** Owner marks a comment addressed. Column grants stop owners changing the reviewer's words. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const { id, cid } = await params;
    const review = await getReview(id);
    if (!review) return notFound();
    const p = await parseJson(req, Patch);
    if (!p.ok) return p.res;
    const row = await setAddressed(cid, p.data.addressed);
    if (!row || row.review_id !== review.id) return notFound();
    if (p.data.addressed) await logEvent(review.id, row.invite_id, 'comment_addressed', {});
    return ok({ addressedAt: row.addressed_at });
  });
}
