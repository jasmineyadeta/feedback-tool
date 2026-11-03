import { z } from 'zod';
import { LIMITS } from '@ft/shared';
import { currentUser } from '@/lib/server/supabase';
import { ok, parseJson, rateLimit, tooMany, unauthorized } from '@/lib/server/http';
import { createPdfReview } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

const Body = z.object({
  artifactType: z.literal('pdf'),
  title: z.string().trim().max(LIMITS.titleMaxChars).default(''),
  context: z.string().trim().max(LIMITS.contextMaxChars).default(''),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();
    const p = await parseJson(req, Body);
    if (!p.ok) return p.res;
    if (!(await rateLimit(`review:${user.id}`, 10, 3600))) return tooMany();
    return ok(await createPdfReview(user.id, p.data), 201);
  });
}
