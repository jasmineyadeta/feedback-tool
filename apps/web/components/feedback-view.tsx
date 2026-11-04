'use client';

import { useMemo, useState } from 'react';
import type { PdfAnchor } from '@ft/shared';
import { PdfViewer, type PdfMarker } from './pdf-viewer';
import { btn } from './ui';

type Comment = {
  id: string;
  invite_id: string;
  text: string;
  anchor: PdfAnchor | null;
  general: boolean;
  addressed_at: string | null;
  created_at: string;
};
type Reviewer = { id: string; name: string; submitted_at: string };

/** SPEC §3.3: artifact left, comments right (desktop); artifact + bottom sheet (mobile). */
export function FeedbackView(p: {
  reviewId: string;
  pdfUrl: string;
  pageCount: number;
  comments: Comment[];
  reviewers: Reviewer[];
}) {
  const [comments, setComments] = useState(p.comments);
  const [filter, setFilter] = useState<string>('all');
  const [active, setActive] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => new Map(p.reviewers.map((r) => [r.id, r.name])), [p.reviewers]);

  const visible = comments.filter((c) => filter === 'all' || c.invite_id === filter);
  const pinned = visible.filter((c) => !c.general && c.anchor);
  const general = visible.filter((c) => c.general);
  const number = new Map(pinned.map((c, i) => [c.id, i + 1]));
  const markers: PdfMarker[] = pinned.map((c) => ({
    id: c.id,
    n: number.get(c.id)!,
    anchor: c.anchor!,
    active: c.id === active,
  }));
  const open = pinned.filter((c) => !c.addressed_at).length;

  function goTo(id: string) {
    setActive(id);
    setSheetOpen(false);
    // Markers exist on every page (even before it renders), so this always lands on the anchor.
    requestAnimationFrame(() =>
      document
        .getElementById(`marker-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
    );
  }

  async function toggle(c: Comment) {
    setError(null);
    const addressed = !c.addressed_at;
    const set = (v: string | null) =>
      setComments((l) => l.map((x) => (x.id === c.id ? { ...x, addressed_at: v } : x)));
    set(addressed ? new Date().toISOString() : null); // optimistic; reverted on failure
    const res = await fetch(`/api/reviews/${p.reviewId}/comments/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addressed }),
    }).catch(() => null);
    if (!res?.ok) {
      set(c.addressed_at);
      return setError('That didn’t save. Check your connection and try again.');
    }
    set(((await res.json()) as { addressedAt: string | null }).addressedAt);
  }

  const card = (c: Comment) => (
    <li
      key={c.id}
      className={`p-4 text-sm ${active === c.id ? 'bg-blue-50' : ''}`}
      data-testid="feedback-comment"
      data-comment-anchor={c.id}
    >
      <button className="block w-full text-left" onClick={() => c.anchor && goTo(c.id)}>
        <span className="flex items-center gap-2 text-xs text-muted">
          {number.has(c.id) && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
              {number.get(c.id)}
            </span>
          )}
          <span>
            {names.get(c.invite_id) ?? 'Reviewer'}{' '}
            <span title="Reviewers type their own name">(self-reported)</span>
            {c.anchor ? ` · Page ${c.anchor.page}` : ' · General note'}
          </span>
        </span>
        {c.anchor?.textQuote && (
          <span className="mt-1 block truncate border-l-2 border-amber-300 pl-2 text-xs text-muted">
            {c.anchor.textQuote.exact}
          </span>
        )}
        <span
          className={`mt-1 block whitespace-pre-wrap ${c.addressed_at ? 'text-muted line-through' : ''}`}
        >
          {c.text}
        </span>
      </button>
      <label className="mt-2 inline-flex items-center gap-2 text-xs">
        <input type="checkbox" checked={!!c.addressed_at} onChange={() => void toggle(c)} />
        Mark addressed
      </label>
    </li>
  );

  const panel = (
    <>
      <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Comments ({pinned.length}){open < pinned.length ? ` · ${open} open` : ''}
          </h2>
          <button className="text-sm text-muted md:hidden" onClick={() => setSheetOpen(false)}>
            Close
          </button>
        </div>
        {p.reviewers.length > 1 && (
          <label className="block text-xs">
            <span className="sr-only">Filter by reviewer</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-md border border-line bg-white p-1.5 text-sm"
              aria-label="Filter by reviewer"
            >
              <option value="all">All reviewers</option>
              {p.reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
      <ol className="divide-y divide-line">{pinned.map(card)}</ol>
      {general.length > 0 && (
        <>
          <h3 className="border-t border-line px-4 pt-4 text-xs font-semibold text-muted">
            General notes
          </h3>
          <ul className="divide-y divide-line">{general.map(card)}</ul>
        </>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PdfViewer
            url={p.pdfUrl}
            pageCount={p.pageCount}
            markers={markers}
            picking={false}
            onPick={() => undefined}
            onMarker={(id) => {
              setActive(id);
              setSheetOpen(true);
              requestAnimationFrame(() =>
                document
                  .querySelector(`[data-comment-anchor="${id}"]`)
                  ?.scrollIntoView({ block: 'nearest' }),
              );
            }}
          />
        </div>
        <aside
          className={`${sheetOpen ? 'fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] rounded-t-xl shadow-2xl' : 'hidden'} flex-col overflow-auto border-l border-line bg-white md:static md:flex md:max-h-none md:w-96 md:rounded-none md:shadow-none`}
          aria-label="Feedback comments"
        >
          {panel}
        </aside>
      </div>
      <nav className="shrink-0 border-t border-line bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <button className={`${btn.secondary} w-full`} onClick={() => setSheetOpen(true)}>
          Comments ({pinned.length + general.length})
        </button>
      </nav>
    </div>
  );
}
