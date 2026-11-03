import 'server-only';
import { redirect } from 'next/navigation';
import { currentUser } from './supabase';

export const DEV_OWNER_EMAIL = 'jas@local.test';

/** True only in `next dev`. Next inlines NODE_ENV at build time, so production bundles drop the dev path. */
export function devShortcutEnabled(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'development';
}

export async function requireOwner() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  return user;
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/reviews';
}
