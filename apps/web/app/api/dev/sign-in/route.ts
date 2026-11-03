import { NextResponse } from 'next/server';
import { adminClient, userClient } from '@/lib/server/supabase';
import { DEV_OWNER_EMAIL, devShortcutEnabled } from '@/lib/server/auth';
import { env } from '@/lib/server/env';

/** D31 dev-only "Sign in as Jas". 404 in production builds (tested in e2e + unit). */
export async function POST() {
  if (!devShortcutEnabled()) return new NextResponse('Not found', { status: 404 });
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: DEV_OWNER_EMAIL,
  });
  if (error) return new NextResponse('Run pnpm setup to create the dev account.', { status: 500 });
  const sb = await userClient();
  await sb.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
  return NextResponse.redirect(`${env().APP_ORIGIN}/reviews`, 303);
}
