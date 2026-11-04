import { z } from 'zod';
import { OwnerMoveRequest } from '@ft/shared';
import { currentUser } from '@/lib/server/supabase';
import { notFound, ok, parseJson, unauthorized } from '@/lib/server/http';
import { getReview, setAddressed } from '@/lib/server/reviews';
import { moveAnchor } from '@/lib/server/owner-move';
import { logEvent } from '@/lib/server/events';
import { handle } from '@/lib/server/route';

const Patch = z.union([z.object({ addressed: z.boolean() }), OwnerMoveRequest]);
type Ctx = { params: Promise<{ id: string; cid: string }> };

/**
 * Owner marks a comment addressed, or moves an auto-placed comment (SPEC §3.3).
 * Neither can change the reviewer's words.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const { id, cid } = await params;
    const review = await getReview(id);
    if (!review) return notFound();
    const p = await parseJson(req, Patch);
    if (!p.ok) return p.res;
    if ('anchor' in p.data) {
      const moved = await moveAnchor(review, cid, p.data.anchor);
      return moved ? ok(moved) : notFound();
    }
    const row = await setAddressed(cid, p.data.addressed);
    if (!row || row.review_id !== review.id) return notFound();
    if (p.data.addressed) await logEvent(review.id, row.invite_id, 'comment_addressed', {});
    return ok({ addressedAt: row.addressed_at });
  });
}
