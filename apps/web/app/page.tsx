import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Get feedback on your work, where it lives.
      </h1>
      <p className="text-muted">
        Share your portfolio site or resume PDF. Reviewers open a link, talk through what they see,
        and tap to point. No accounts for them.
      </p>
      <div>
        <Link
          href="/sign-in"
          className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign in to start
        </Link>
      </div>
    </main>
  );
}
