import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/supabase';
import { devShortcutEnabled } from '@/lib/server/auth';
import { SignInForm } from '@/components/sign-in-form';
import { SiteLinks } from '@/components/legal-page';

export const dynamic = 'force-dynamic';

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect('/reviews');
  const { error } = await searchParams;
  const dev = devShortcutEnabled();
  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {error === 'link' && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      )}
      <SignInForm localInbox={dev ? (process.env.MAILPIT_URL ?? null) : null} />
      {dev && (
        <form action="/api/dev/sign-in" method="post" className="border-t border-line pt-6">
          <button
            type="submit"
            className="w-full rounded-md border border-line px-4 py-2 text-sm hover:bg-white"
          >
            Sign in as Jas (dev only)
          </button>
        </form>
      )}
      <SiteLinks className="mt-8" />
    </main>
  );
}
