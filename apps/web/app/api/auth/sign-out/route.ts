import { NextResponse } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { env } from '@/lib/server/env';

export async function POST() {
  const sb = await userClient();
  await sb.auth.signOut();
  return NextResponse.redirect(`${env().APP_ORIGIN}/`, 303);
}
