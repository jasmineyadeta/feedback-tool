'use client';

import { useMemo, useRef, useState } from 'react';
import type { Anchor } from '@ft/shared';
import { PdfViewer, type PdfMarker } from './pdf-viewer';
import { SiteViewer, type LocateMethod, type SiteFocus, type SiteMarker } from './site-viewer';
import { ScreenshotViewer, type ShotMarker } from './screenshot-viewer';
import { btn } from './ui';
import { anchorLabel, quoteOf, type ReviewerArtifact } from '@/lib/artifact';

type Comment = {
  id: string;
  invite_id: string;
  text: string;
  anchor: Anchor | null;
  anchor_source: string | null;
  general: boolean;
  addressed_at: string | null;
  created_at: string;
  recording_id: string | null;
  span_start_ms: number | null;
  span_end_ms: number | null;
  transcript_original: string | null;
  /** Signed URL of the page screenshot taken at submit (websites), if any. */
  screenshot_url: string | null;
};

const SOURCE: Record<string, string> = {
  tap: 'Tapped',
  ai: 'Auto-placed',
  viewport: 'On screen',
  manual: 'Typed',
  owner_moved: 'Moved by you',
};
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
type Reviewer = { id: string; name: string; submitted_at: string };

/** SPEC §3.3: artifact left, comments right (desktop); artifact + bottom sheet (mobile). */
export function FeedbackView(p: {
  reviewId: string;
  artifact: ReviewerArtifact;
  comments: Comment[];
  reviewers: Reviewer[];
}) {
  const [comments, setComments] = useState(p.comments);
  const [filter, setFilter] = useState<string>('all');
  const [active, setActive] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<SiteFocus | null>(null);
  const [located, setLocated] = useState<{ id: string; method: LocateMethod | null } | null>(null);
  const art = p.artifact;
  const names = useMemo(() => new Map(p.reviewers.map((r) => [r.id, r.name])), [p.reviewers]);

  const visible = comments.filter((c) => filter === 'all' || c.invite_id === filter);
  const pinned = visible.filter((c) => !c.general && c.anchor);
  const general = visible.filter((c) => c.general);
  const number = new Map(pinned.map((c, i) => [c.id, i + 1]));
  const markers: PdfMarker[] = pinned.flatMap((c) =>
    c.anchor?.kind === 'pdf'
      ? [{ id: c.id, n: number.get(c.id)!, anchor: c.anchor, active: c.id === active }]
      : [],
  );

  const siteMarkers: SiteMarker[] = pinned.flatMap((c) =>
    c.anchor?.kind === 'dom' ? [{ id: c.id, n: number.get(c.id)!, anchor: c.anchor }] : [],
  );

  const shotMarkers: ShotMarker[] = pinned.flatMap((c) =>
    c.anchor?.kind === 'screenshot'
      ? [{ id: c.id, n: number.get(c.id)!, anchor: c.anchor, active: c.id === active }]
      : [],
  );

  // One shared player: plays exactly the comment's span of the reviewer's recording.
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<Record<string, string>>({});
  async function play(c: Comment) {
    if (!c.recording_id) return;
    const el = (audio.current ??= new Audio());
    if (playing === c.id) {
      el.pause();
      return setPlaying(null);
    }
    let url = urls.current.get(c.recording_id);
    if (!url) {
      const res = await fetch(
        `/api/reviews/${p.reviewId}/recordings/${c.recording_id}/audio`,
      ).catch(() => null);
      const body = (await res?.json().catch(() => null)) as {
        url?: string;
        error?: { message: string };
      } | null;
      if (!res?.ok || !body?.url)
        return setAudioNote((n) => ({
          ...n,
          [c.id]: body?.error?.message ?? 'Couldn’t load the recording. Try again.',
        }));
      url = body.url;
      urls.current.set(c.recording_id, url);
    }
    const start = (c.span_start_ms ?? 0) / 1000;
    const end = c.span_end_ms ? c.span_end_ms / 1000 + 0.3 : Infinity;
    el.src = url;
    el.ontimeupdate = () => {
      if (el.currentTime >= end) {
        el.pause();
        setPlaying(null);
      }
    };
    el.onended = () => setPlaying(null);
    el.onloadedmetadata = () => {
      el.currentTime = start;
      void el.play().catch(() => setPlaying(null));
    };
    el.load();
    setPlaying(c.id);
  }
  const open = pinned.filter((c) => !c.addressed_at).length;

  function goTo(id: string) {
    setActive(id);
    setSheetOpen(false);
    // Markers exist on every page (even before it renders), so this always lands on the anchor.
    // Page-level ("On screen") comments scroll to the top of their page.
    const c = comments.find((x) => x.id === id);
    if (art.kind === 'site') {
      if (!c?.anchor) return;
      setLocated({ id, method: null });
      setFocus((f) => ({
        anchor: c.anchor!,
        label: String(number.get(id) ?? ''),
        seq: (f?.seq ?? 0) + 1,
      }));
      return;
    }
    requestAnimationFrame(() =>
      (c?.anchor?.kind === 'pdf-page'
        ? document.querySelector(`[data-page="${c.anchor.page}"]`)
        : document.getElementById(`marker-${id}`)
      )?.scrollIntoView({
        behavior: 'smooth',
        block: c?.anchor?.kind === 'pdf-page' ? 'start' : 'center',
        inline: 'center',
      }),
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
            {c.anchor ? ` · ${anchorLabel(c.anchor)}` : ' · General note'}
          </span>
          {c.anchor_source && SOURCE[c.anchor_source] && (
            <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink ring-1 ring-line">
              {SOURCE[c.anchor_source]}
            </span>
          )}
        </span>
        {quoteOf(c.anchor) && (
          <span className="mt-1 block truncate border-l-2 border-amber-300 pl-2 text-xs text-muted">
            {quoteOf(c.anchor)}
          </span>
        )}
        <span
          className={`mt-1 block whitespace-pre-wrap ${c.addressed_at ? 'text-muted line-through' : ''}`}
        >
          {c.text}
        </span>
      </button>
      {c.transcript_original && norm(c.transcript_original) !== norm(c.text) && (
        <details className="mt-1 text-xs text-muted">
          <summary className="cursor-pointer">Original transcript</summary>
          <p className="mt-1 whitespace-pre-wrap">{c.transcript_original}</p>
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        {c.recording_id && (
          <button className="font-medium underline" onClick={() => void play(c)}>
            {playing === c.id ? 'Stop' : 'Play'}
            <span className="sr-only"> recording for this comment</span>
          </button>
        )}
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!c.addressed_at} onChange={() => void toggle(c)} />
          Mark addressed
        </label>
      </div>
      {audioNote[c.id] && <p className="mt-1 text-xs text-muted">{audioNote[c.id]}</p>}
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
        <div className="relative min-w-0 flex-1">
          {art.kind === 'screenshot' ? (
            <ScreenshotViewer
              audience="owner"
              screens={art.screens}
              pagePath={art.pagePath}
              markers={shotMarkers}
              picking={false}
              onMarker={(id) => {
                setActive(id);
                setSheetOpen(true);
              }}
            />
          ) : art.kind === 'site' ? (
            <>
              <SiteViewer
                enterUrl={art.enterUrl}
                proxyOrigin={art.proxyOrigin}
                markers={siteMarkers}
                mode="browse"
                focus={focus}
                onPick={() => undefined}
                onLocated={(method) => setLocated((l) => l && { ...l, method })}
              />
              {located && (
                <LocateNote
                  comment={comments.find((c) => c.id === located.id) ?? null}
                  n={number.get(located.id) ?? 0}
                  method={located.method}
                  onClose={() => setLocated(null)}
                />
              )}
            </>
          ) : (
            <PdfViewer
              url={art.url}
              pageCount={art.pageCount}
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
          )}
        </div>
        <aside
          className={`${sheetOpen ? 'fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] rounded-t-xl shadow-2xl' : 'hidden'} flex-col overflow-auto border-l border-line bg-white md:static md:flex md:max-h-none md:w-80 md:rounded-none md:shadow-none`}
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

/**
 * SPEC §3.3 / §4.3: how the comment was found on today's page. If it can't be found, show the
 * screenshot taken when the reviewer submitted, with the marker, and say the page has changed.
 */
function LocateNote(p: {
  comment: Comment | null;
  n: number;
  method: LocateMethod | null;
  onClose: () => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  if (!p.method) return null;
  if (p.method === 'textQuote' || p.method === 'cssPath')
    return (
      <p className="sr-only" role="status" data-testid="locate-status" data-method={p.method}>
        Shown on the page.
      </p>
    );
  if (p.method === 'rect')
    return (
      <p
        className="absolute inset-x-3 top-10 z-10 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-300"
        role="status"
        data-testid="locate-status"
        data-method="rect"
      >
        This part of the page has changed since the review. The marker shows where it was.
      </p>
    );
  const a = p.comment?.anchor;
  const pt =
    a?.kind === 'dom'
      ? { x: a.rectDoc.x + a.point.xPct * a.rectDoc.w, y: a.rectDoc.y + a.point.yPct * a.rectDoc.h }
      : a?.kind === 'viewport'
        ? { x: 16, y: a.scroll.y + 24 }
        : null;
  const vw = a && 'viewport' in a ? a.viewport.w : 1;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-paper"
      role="dialog"
      aria-label="Screenshot from the review"
      data-testid="locate-status"
      data-method="none"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="flex-1">
          This part of the page has changed since the review.
          {p.comment?.screenshot_url ? ' Here’s the page as the reviewer saw it.' : ''}
        </p>
        <button className="font-medium underline" onClick={p.onClose}>
          Back to the live page
        </button>
      </div>
      {p.comment?.screenshot_url ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="relative mx-auto w-fit">
            <span className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-0.5 text-xs font-medium text-white">
              Screenshot
            </span>
            <img
              src={p.comment.screenshot_url}
              alt="The page when the review was submitted"
              className="block max-w-full shadow ring-1 ring-line"
              onLoad={(e) =>
                setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
            />
            {pt && size && (
              <span
                className="absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white shadow"
                style={{
                  left: `${(pt.x / vw) * 100}%`,
                  top: `${(pt.y / size.h) * 100}%`,
                }}
                data-testid="screenshot-marker"
              >
                {p.n}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">No screenshot was saved for this comment.</p>
      )}
    </div>
  );
}
