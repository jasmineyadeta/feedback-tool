'use client';
import { useState } from 'react';
import { btn, StatusBadge } from './ui';

type Invite = { id: string; name_hint: string; reviewer_name: string | null; status: string };

export function InvitePanel({ reviewId, initial }: { reviewId: string; initial: Invite[] }) {
  const [invites, setInvites] = useState(initial);
  const [fresh, setFresh] = useState<{ id: string; link: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const nameHint = String(new FormData(form).get('nameHint') ?? '');
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reviews/${reviewId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nameHint }),
    }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok)
      return setError(body?.error?.message ?? "We couldn't create the link. Try again.");
    setInvites((l) => [...l, body.invite]);
    setFresh({ id: body.invite.id, link: body.link, name: nameHint });
    setCopied(false);
    form.reset();
  }
  async function act(id: string, method: 'PATCH' | 'DELETE') {
    if (
      method === 'DELETE' &&
      !confirm('Delete this reviewer link and any feedback they left? This cannot be undone.')
    )
      return;
    const res = await fetch(`/api/invites/${id}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'PATCH' ? JSON.stringify({ action: 'revoke' }) : undefined,
    }).catch(() => null);
    if (!res?.ok) return setError("That didn't work. Reload the page and try again.");
    setInvites((l) =>
      method === 'DELETE'
        ? l.filter((i) => i.id !== id)
        : l.map((i) => (i.id === id ? { ...i, status: 'revoked' } : i)),
    );
    if (fresh?.id === id) setFresh(null);
  }
  const emailText = fresh
    ? `Hi${fresh.name ? ` ${fresh.name}` : ''}, would you take a few minutes to look at my work? Open this link, hit record and talk through what you notice. You can tap things to point at them. No account needed.\n\n${fresh.link}`
    : '';

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Reviewers</h2>
      <p className="mt-1 text-sm text-muted">
        Each reviewer gets their own link. You can revoke a link at any time.
      </p>
      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Reviewer name <span className="font-normal text-muted">optional</span>
          <input
            name="nameHint"
            maxLength={120}
            className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
            placeholder="Priya"
          />
        </label>
        <button type="submit" disabled={busy} className={btn.primary}>
          Create reviewer link
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {fresh && (
        <div className="mt-4 rounded-md bg-white p-4 ring-1 ring-line" data-testid="new-invite">
          <p className="text-sm font-medium">
            Link ready. Copy it now; for privacy we only show it once.
          </p>
          <input
            readOnly
            value={fresh.link}
            aria-label="Reviewer link"
            className="mt-2 w-full rounded border border-line bg-paper px-2 py-1 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn.secondary}
              onClick={async () => {
                await navigator.clipboard?.writeText(fresh.link).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                className={btn.secondary}
                onClick={() => navigator.share({ text: emailText }).catch(() => {})}
              >
                Share…
              </button>
            )}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">
              Message you can paste into an email
            </summary>
            <textarea
              readOnly
              rows={5}
              value={emailText}
              className="mt-2 w-full rounded border border-line bg-paper p-2 text-sm"
            />
          </details>
        </div>
      )}
      {invites.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="font-medium">{i.reviewer_name || i.name_hint || 'Reviewer'}</span>
                <StatusBadge status={i.status} />
              </span>
              <span className="flex gap-2">
                {i.status !== 'revoked' && i.status !== 'submitted' && (
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => act(i.id, 'PATCH')}
                  >
                    Revoke
                  </button>
                )}
                <button type="button" className={btn.danger} onClick={() => act(i.id, 'DELETE')}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
