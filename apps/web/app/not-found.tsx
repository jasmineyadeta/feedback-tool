import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">We couldn’t find that page</h1>
      <p className="mt-2 text-sm text-muted">
        The address may be mistyped, or the review was deleted.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/reviews" className="font-medium underline">
          Go to your reviews
        </Link>
      </p>
    </main>
  );
}
