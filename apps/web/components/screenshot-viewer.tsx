'use client';
import { useEffect, useRef, useState } from 'react';
import type { ScreenshotAnchor, TimelineSnapshot, Tone } from '@ft/shared';
import { TONE } from '@/lib/tone-style';
import { pickScreen } from '@/lib/site-mode';

export type ShotMarker = {
  id: string;
  n: number;
  anchor: ScreenshotAnchor;
  active: boolean;
  tone?: Tone | null;
};
type Screen = { name: string; width: number; url: string };

/**
 * Screenshot mode (PRD non-negotiable: never pass a screenshot off as the live site). The label is
 * always visible above the image. Taps become screenshot anchors (point as % of the image).
 */
export function ScreenshotViewer(p: {
  screens: Screen[];
  pagePath: string;
  markers: ShotMarker[];
  picking: boolean;
  onPick?: (a: ScreenshotAnchor) => void;
  onMarker?: (id: string) => void;
  /** While recording: "what was on screen" every second and at scroll end. */
  recording?: boolean;
  onSnapshot?: (s: TimelineSnapshot) => void;
  audience: 'reviewer' | 'owner';
}) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => setScreen(pickScreen(p.screens, window.innerWidth)), [p.screens]);

  const anchorAt = (xPct: number, yPct: number): ScreenshotAnchor => ({
    kind: 'screenshot',
    pagePath: p.pagePath,
    imageKey: screen!.name,
    point: { xPct: Math.min(1, Math.max(0, xPct)), yPct: Math.min(1, Math.max(0, yPct)) },
  });

  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    if (!p.recording || !screen) return;
    const snap = () => {
      const el = scroller.current;
      const im = img.current;
      if (!el || !im) return;
      const top = im.offsetTop;
      const center = (el.scrollTop + el.clientHeight / 2 - top) / Math.max(1, im.clientHeight);
      latest.current.onSnapshot?.({
        t: 0, // stamped by the recorder
        pagePath: p.pagePath,
        scrollY: el.scrollTop,
        elements: [],
        viewportAnchor: anchorAt(0.5, center),
      });
    };
    snap();
    const every = setInterval(snap, 1000);
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(snap, 250);
    };
    const el = scroller.current;
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearInterval(every);
      clearTimeout(t);
      el?.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.recording, screen]);

  return (
    <div className="flex h-full flex-col">
      <p
        className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
        data-testid="screenshot-label"
      >
        <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold">Screenshot</span>
        <span>
          {p.audience === 'reviewer'
            ? 'This is a picture of the site, not the live site. Links and buttons won’t work.'
            : 'Reviewers saw this screenshot, not the live site.'}
        </span>
      </p>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto bg-paper p-3"
        data-testid="screenshot-scroller"
        tabIndex={0}
        role="region"
        aria-label="Screenshot of the site"
      >
        {screen && (
          <div className="relative mx-auto w-fit">
            <img
              ref={img}
              src={screen.url}
              alt={`Screenshot of ${p.pagePath === '/' ? 'the home page' : p.pagePath}`}
              className={`block max-w-full shadow ring-1 ring-line ${p.picking ? 'cursor-crosshair' : ''}`}
              tabIndex={p.picking ? 0 : undefined}
              aria-description={
                p.picking ? 'Press Enter to comment on the part in view' : undefined
              }
              onKeyDown={(e) => {
                if (!p.picking || !p.onPick || e.key !== 'Enter') return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const top = Math.max(r.top, 0);
                const bottom = Math.min(r.bottom, window.innerHeight);
                p.onPick(anchorAt(0.5, ((top + bottom) / 2 - r.top) / r.height));
              }}
              onClick={(e) => {
                if (!p.picking || !p.onPick) return;
                const r = e.currentTarget.getBoundingClientRect();
                p.onPick(anchorAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
              }}
            />
            {p.markers
              .filter((m) => m.anchor.imageKey === screen.name)
              .map((m) => (
                <button
                  key={m.id}
                  id={`marker-${m.id}`}
                  aria-label={`Comment ${m.n}`}
                  onClick={() => p.onMarker?.(m.id)}
                  className={`absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white shadow ${m.active ? 'bg-ink ring-2 ring-accent' : m.tone ? TONE[m.tone].dot : 'bg-accent'}`}
                  style={{
                    left: `${m.anchor.point.xPct * 100}%`,
                    top: `${m.anchor.point.yPct * 100}%`,
                  }}
                >
                  {m.n}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
