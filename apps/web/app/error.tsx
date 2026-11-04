'use client';
import { btn } from '@/components/ui';

/** Unexpected errors: say what happened and what to do; never show error details (may hold content). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong on our side</h1>
      <p className="mt-2 text-sm text-muted">
        Your saved comments are safe. Try again, and if it keeps happening, reload the page in a
        minute.
      </p>
      <div className="mt-4">
        <button className={btn.primary} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
