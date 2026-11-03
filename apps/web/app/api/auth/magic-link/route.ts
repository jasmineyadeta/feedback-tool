import { z } from 'zod';
import { headers } from 'next/headers';
import { env } from '@/lib/server/env';
import { userClient } from '@/lib/server/supabase';
import { fail, ok, parseJson, rateLimit, tooMany } from '@/lib/server/http';

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function POST(req: Request) {
  const p = await parseJson(req, Body);
  if (!p.ok) return fail(400, 'Enter a valid email address.', 'invalid_email');
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!(await rateLimit(`magic:${ip}`, 5, 600))) return tooMany();
  const sb = await userClient();
  const { error } = await sb.auth.signInWithOtp({
    email: p.data.email,
    options: {
      emailRedirectTo: `${env().APP_ORIGIN}/auth/confirm?next=/reviews`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    console.error('magic link failed', error.status);
    return fail(
      502,
      "We couldn't send the sign-in email. Wait a minute and try again.",
      'send_failed',
    );
  }
  return ok({ sent: true });
}
