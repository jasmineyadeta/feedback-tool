'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  Anchor,
  DomAnchor,
  TimelineSnapshot,
  TimelineTap,
  Tone,
  ViewportAnchor,
} from '@ft/shared';
import { parseOverlayMessage, type ShellToOverlay } from '@ft/shared/protocol';
import { enterAt } from '@/lib/artifact';

type ToOverlay = DistOmit<ShellToOverlay>;
type DistOmit<T> = T extends unknown ? Omit<T, 'ft'> : never;

export type SiteMarker = { id: string; n: number; anchor: Anchor; tone?: Tone | null };
export type SiteFocus = { anchor: Anchor; label: string; seq: number };
export type SiteMode = 'browse' | 'pick' | 'record';
export type LocateMethod = 'textQuote' | 'cssPath' | 'rect' | 'none';

/**
 * Live website in the proxy iframe (SPEC §3.2, §6). All talk with the overlay goes through
 * origin-checked, zod-validated postMessage. Modes, markers and focus are re-sent whenever the
 * overlay (re)announces itself, so they survive full page loads inside the frame.
 */
export function SiteViewer(p: {
  enterUrl: string;
  proxyOrigin: string;
  markers: SiteMarker[];
  mode: SiteMode;
  focus: SiteFocus | null;
  onPick: (anchor: DomAnchor | ViewportAnchor) => void;
  onTap?: (tap: TimelineTap) => void;
  onUntap?: (eid: string) => void;
  onSnapshot?: (s: TimelineSnapshot) => void;
  onPath?: (path: string) => void;
  onLocated?: (method: LocateMethod) => void;
  /** A number on the page was clicked: the marker's comment id. */
  onMarker?: (id: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [path, setPath] = useState<string | null>(null);
  const [external, setExternal] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  // No overlay after 15 s: the site (or review mode) isn't loading. Say so instead of a blank frame.
  useEffect(() => {
    if (path !== null) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(t);
  }, [path]);
  const latest = useRef(p);
  latest.current = p;
  const pendingFocus = useRef<SiteFocus | null>(null);
  /** Overlay eids restart on every page load; prefix them so two pages never share an eid. */
  const loadSeq = useRef(0);
  const ns = (eid: string) => `${loadSeq.current}.${eid}`.slice(0, 40);

  const send = (m: ToOverlay) =>
    frame.current?.contentWindow?.postMessage({ ft: 1, ...m }, p.proxyOrigin);

  const syncState = (here: string) => {
    const cur = latest.current;
    send({ type: 'markers:set', markers: markersFor(cur.markers, here) });
    if (cur.mode === 'pick') send({ type: 'pick:start' });
    if (cur.mode === 'record') send({ type: 'rec:start', baseline: 0 });
    const f = pendingFocus.current;
    if (f && 'pagePath' in f.anchor && f.anchor.pagePath === here) {
      pendingFocus.current = null;
      send({ type: 'anchor:show', requestId: String(f.seq), anchor: f.anchor, label: f.label });
    }
  };

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== p.proxyOrigin || e.source !== frame.current?.contentWindow) return;
      const m = parseOverlayMessage(e.data);
      if (!m) return;
      const cur = latest.current;
      switch (m.type) {
        case 'overlay:ready':
          loadSeq.current++;
        // falls through
        case 'nav':
          setPath(m.pagePath);
          setExternal(null);
          cur.onPath?.(m.pagePath);
          syncState(m.pagePath);
          break;
        case 'anchor:picked':
          if (m.anchor.kind === 'dom' || m.anchor.kind === 'viewport') cur.onPick(m.anchor);
          break;
        case 'tap':
          cur.onTap?.({ ...m.tap, eid: m.tap.eid && ns(m.tap.eid) });
          break;
        case 'tap:undo':
          cur.onUntap?.(ns(m.eid));
          break;
        case 'timeline':
          cur.onSnapshot?.({
            ...m.snapshot,
            elements: m.snapshot.elements.map((el) => ({ ...el, eid: ns(el.eid) })),
          });
          break;
        case 'anchor:located':
          cur.onLocated?.(m.found ? m.method : 'none');
          break;
        case 'external-link':
          setExternal(m.host);
          break;
        case 'marker:click': {
          const hit = cur.markers.find((x) => String(x.n) === m.label);
          if (hit) cur.onMarker?.(hit.id);
          break;
        }
      }
    };
    window.addEventListener('message', onMsg);
    send({ type: 'ping' }); // in case the frame loaded before we listened
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.proxyOrigin]);

  // Mode changes.
  const prevMode = useRef<SiteMode>('browse');
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = p.mode;
    if (was === p.mode) return;
    if (was === 'pick') send({ type: 'pick:cancel' });
    if (was === 'record') send({ type: 'rec:stop' });
    if (p.mode === 'pick') send({ type: 'pick:start' });
    if (p.mode === 'record') send({ type: 'rec:start', baseline: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.mode]);

  // Markers.
  const markerKey = JSON.stringify(p.markers.map((m) => [m.id, m.n, m.tone]));
  useEffect(() => {
    if (path) send({ type: 'markers:set', markers: markersFor(p.markers, path) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, path]);

  // Focus: show it here, or load its page first.
  useEffect(() => {
    const f = p.focus;
    if (!f || !('pagePath' in f.anchor)) return;
    if (f.anchor.pagePath === path) {
      send({ type: 'anchor:show', requestId: String(f.seq), anchor: f.anchor, label: f.label });
    } else {
      pendingFocus.current = f;
      // Imperative: the URL may equal the initial src (React would skip it), and it must reload anyway.
      if (frame.current) frame.current.src = enterAt(p.enterUrl, f.anchor.pagePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.seq]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-white px-3 py-1 text-xs text-muted">
        <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-900">
          Live site
        </span>
        <span className="truncate" data-testid="site-path">
          {path === null ? 'Loading…' : path === '/' ? 'Home page' : path}
        </span>
        {external && (
          <span className="ml-auto truncate" role="status">
            Links to {external} open in a new tab.
          </span>
        )}
      </div>
      {slow && (
        <p role="alert" className="shrink-0 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The site is taking a long time to load. Check your connection, then reload this page.
        </p>
      )}
      <iframe
        ref={frame}
        src={p.enterUrl}
        title="Website being reviewed"
        data-testid="site-frame"
        className="min-h-0 w-full flex-1 border-0 bg-white"
        allow="fullscreen"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function markersFor(markers: SiteMarker[], path: string) {
  return markers
    .filter(
      (m) =>
        (m.anchor.kind === 'dom' || m.anchor.kind === 'viewport') && m.anchor.pagePath === path,
    )
    .slice(0, 60)
    .map((m) => ({ anchor: m.anchor, label: String(m.n), ...(m.tone ? { tone: m.tone } : {}) }));
}
