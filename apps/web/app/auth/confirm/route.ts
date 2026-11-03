import { NextResponse, type NextRequest } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { safeNext } from '@/lib/server/auth';
import { env } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const base = env().APP_ORIGIN;
  if (!tokenHash) return NextResponse.redirect(`${base}/sign-in?error=link`);
  const sb = await userClient();
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error) return NextResponse.redirect(`${base}/sign-in?error=link`);
  return NextResponse.redirect(`${base}${next}`);
}
