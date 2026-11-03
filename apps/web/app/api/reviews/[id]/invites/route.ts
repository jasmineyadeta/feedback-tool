import { z } from 'zod';
import { currentUser } from '@/lib/server/supabase';
import { notFound, ok, parseJson, rateLimit, tooMany, unauthorized } from '@/lib/server/http';
import { createInvite, getReview } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

const Body = z.object({ nameHint: z.string().trim().max(120).default('') });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();
    const review = await getReview((await params).id);
    if (!review) return notFound();
    const p = await parseJson(req, Body);
    if (!p.ok) return p.res;
    if (!(await rateLimit(`invite:${user.id}`, 40, 3600))) return tooMany();
    return ok(await createInvite(review, p.data.nameHint), 201);
  });
}
