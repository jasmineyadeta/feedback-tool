'use client';
import { useState } from 'react';

export function SignInForm({ localInbox }: { localInbox: string | null }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const email = new FormData(e.currentTarget).get('email');
    const res = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.ok) return setState('sent');
    const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
    setError(
      body?.error?.message ?? "We couldn't reach the server. Check your connection and try again.",
    );
    setState('idle');
  }
  if (state === 'sent')
    return (
      <div role="status" className="rounded-md bg-white p-4 text-sm shadow-sm ring-1 ring-line">
        <p className="font-medium">Check your email for a sign-in link.</p>
        {localInbox && (
          <p className="mt-2 text-muted">
            Running locally: the email is in the{' '}
            <a className="underline" href={localInbox} target="_blank" rel="noreferrer">
              local inbox
            </a>
            .
          </p>
        )}
      </div>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
