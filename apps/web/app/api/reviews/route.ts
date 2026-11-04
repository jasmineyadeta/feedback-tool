import { z } from 'zod';
import { LIMITS } from '@ft/shared';
import { currentUser } from '@/lib/server/supabase';
import { ok, parseJson, rateLimit, tooMany, unauthorized } from '@/lib/server/http';
import { createPdfReview, createSiteReview } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

const common = {
  title: z.string().trim().max(LIMITS.titleMaxChars).default(''),
  context: z.string().trim().max(LIMITS.contextMaxChars).default(''),
};
const Body = z.discriminatedUnion('artifactType', [
  z.object({ artifactType: z.literal('pdf'), ...common }),
  z.object({ artifactType: z.literal('website'), url: z.string().trim().max(2048), ...common }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();
    const p = await parseJson(req, Body);
    if (!p.ok) return p.res;
    if (!(await rateLimit(`review:${user.id}`, 10, 3600))) return tooMany();
    const d = p.data;
    return ok(
      d.artifactType === 'pdf'
        ? await createPdfReview(user.id, d)
        : await createSiteReview(user.id, d),
      201,
    );
  });
}
