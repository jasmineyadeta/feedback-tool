'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist';
import type { PdfAnchor } from '@ft/shared';

/**
 * pdf.js viewer (SPEC §4.2): lazy page rendering, zoom, selectable text layer, numbered markers.
 * In pick mode a tap returns a pin anchor; outside pick mode a text selection returns a quote anchor.
 */
export type PdfMarker = { id: string; n: number; anchor: PdfAnchor; active?: boolean };

type Props = {
  url: string | (() => Promise<string>);
  pageCount: number;
  markers: PdfMarker[];
  picking: boolean;
  onPick: (a: PdfAnchor) => void;
  onSelection?: (a: PdfAnchor | null) => void;
  onMarker?: (id: string) => void;
  onPageChange?: (page: number) => void;
};

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const CTX = 32;

export function PdfViewer(props: Props) {
  const { url, pageCount, onPageChange } = props;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const src = typeof url === 'string' ? url : await url();
        const t = pdfjs.getDocument({ url: src, disableAutoFetch: true, enableXfa: false });
        task = t;
        const d = await t.promise;
        const p1 = await d.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        if (cancelled) return;
        setBase({ w: v.width, h: v.height });
        setDoc(d);
      } catch {
        if (!cancelled) setError('We couldn’t open this PDF. Reload the page to try again.');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onVisible = useCallback(
    (n: number) => {
      setPage(n);
      onPageChange?.(n);
    },
    [onPageChange],
  );

  const fit = base && width ? Math.min((width - 24) / base.w, 2) : 1;
  const scale = fit * zoom;
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto bg-neutral-200/70 px-3 py-4"
        data-testid="pdf-scroller"
      >
        {error && <p className="mx-auto max-w-md rounded-md bg-white p-4 text-sm">{error}</p>}
        {!doc && !error && <p className="p-4 text-center text-sm text-muted">Loading PDF…</p>}
        {doc &&
          base &&
          Array.from({ length: Math.min(pageCount, doc.numPages) }, (_, i) => (
            <PdfPage
              key={i + 1}
              doc={doc}
              n={i + 1}
              scale={scale}
              placeholder={base}
              {...props}
              onVisible={onVisible}
              root={scroller}
            />
          ))}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/85 px-2 py-1 text-xs text-white shadow">
        <button
          className="pointer-events-auto rounded-full px-2 py-1 disabled:opacity-40"
          aria-label="Zoom out"
          disabled={zi <= 0}
          onClick={() => setZoom(ZOOMS[zi - 1]!)}
        >
          −
        </button>
        <button
          className="pointer-events-auto min-w-12 rounded-full px-1 py-1"
          aria-label="Fit to width"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="pointer-events-auto rounded-full px-2 py-1 disabled:opacity-40"
          aria-label="Zoom in"
          disabled={zi >= ZOOMS.length - 1}
          onClick={() => setZoom(ZOOMS[zi + 1]!)}
        >
          +
        </button>
        <span className="px-2" aria-live="polite">
          Page {page} of {pageCount}
        </span>
      </div>
    </div>
  );
}

function PdfPage(
  p: Props & {
    doc: PDFDocumentProxy;
    n: number;
    scale: number;
    placeholder: { w: number; h: number };
    onVisible: (n: number) => void;
    root: React.RefObject<HTMLDivElement | null>;
  },
) {
  const { doc, n, scale, placeholder, onVisible, root, picking, onPick, onSelection, onMarker } = p;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textBox = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(n <= 2);
  const [pg, setPg] = useState<PDFPageProxy | null>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);

  // Lazy: only render pages near the viewport; report the page that's mostly on screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const near = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), {
      root: root.current,
      rootMargin: '800px 0px',
    });
    const vis = new IntersectionObserver(([e]) => e?.isIntersecting && onVisible(n), {
      root: root.current,
      threshold: 0.5,
    });
    near.observe(el);
    vis.observe(el);
    return () => {
      near.disconnect();
      vis.disconnect();
    };
  }, [n, onVisible, root]);

  useEffect(() => {
    if (!near || pg) return;
    let live = true;
    doc.getPage(n).then(
      (x) => live && setPg(x),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [near, pg, doc, n]);

  useEffect(() => {
    if (!pg || !canvas.current || !textBox.current) return;
    const viewport = pg.getViewport({ scale });
    setVp(viewport);
    const c = canvas.current;
    // iOS caps canvas area (~16.7M px); keep well under it.
    const maxDpr = Math.sqrt(12_000_000 / (viewport.width * viewport.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2, maxDpr);
    c.width = Math.floor(viewport.width * dpr);
    c.height = Math.floor(viewport.height * dpr);
    let task: RenderTask | null = null;
    let text: { cancel: () => void } | null = null;
    let live = true;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (!live) return;
      task = pg.render({
        canvas: c,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      task.promise.catch(() => undefined);
      const tb = textBox.current!;
      tb.replaceChildren();
      const tl = new pdfjs.TextLayer({
        textContentSource: pg.streamTextContent(),
        container: tb,
        viewport,
      });
      text = tl;
      await tl.render().catch(() => undefined);
    })();
    return () => {
      live = false;
      task?.cancel();
      text?.cancel();
    };
  }, [pg, scale]);

  const w = vp?.width ?? placeholder.w * scale;
  const h = vp?.height ?? placeholder.h * scale;

  function tap(e: React.MouseEvent<HTMLDivElement>) {
    if (!picking || !vp || !box.current) return;
    if ((e.target as HTMLElement).closest('[data-marker]')) return;
    const r = box.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const [px, py] = vp.convertToPdfPoint(x, y) as [number, number];
    onPick({
      kind: 'pdf',
      page: n,
      textQuote: null,
      rectPdf: { x: px, y: py, w: 0, h: 0 },
      point: { xPct: clamp01(x / r.width), yPct: clamp01(y / r.height) },
    });
  }

  function selectionEnd() {
    if (picking || !onSelection || !vp || !box.current || !textBox.current) return;
    // Let the selection settle (iOS updates it after touchend).
    setTimeout(() => onSelection(selectionAnchor(n, vp, box.current!, textBox.current!)), 30);
  }

  return (
    <div
      ref={box}
      data-page={n}
      className={`relative mx-auto mb-4 bg-white shadow-sm ${picking ? 'cursor-crosshair' : ''}`}
      style={
        {
          width: w,
          height: h,
          '--scale-factor': scale,
          '--total-scale-factor': scale,
          '--user-unit': 1,
          '--scale-round-x': '1px',
          '--scale-round-y': '1px',
        } as React.CSSProperties
      }
      onClick={tap}
      onMouseUp={selectionEnd}
      onTouchEnd={selectionEnd}
      aria-label={`Page ${n}`}
      role="region"
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />
      <div
        ref={textBox}
        className="textLayer"
        style={{ pointerEvents: picking ? 'none' : undefined }}
      />
      {p.markers
        .filter((m) => m.anchor.page === n)
        .map((m) => {
          const hl =
            vp && m.anchor.textQuote && m.anchor.rectPdf.w > 0
              ? viewportRect(vp, m.anchor.rectPdf)
              : null;
          return (
            <div key={m.id}>
              {hl && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute rounded-sm ${m.active ? 'bg-amber-300/50' : 'bg-amber-200/35'}`}
                  style={{
                    left: Math.min(hl[0]!, hl[2]!),
                    top: Math.min(hl[1]!, hl[3]!),
                    width: Math.abs(hl[2]! - hl[0]!),
                    height: Math.abs(hl[3]! - hl[1]!),
                  }}
                />
              )}
              <button
                id={`marker-${m.id}`}
                data-marker
                type="button"
                aria-label={`Comment ${m.n}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMarker?.(m.id);
                }}
                className={`absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold text-white shadow ring-2 ring-white ${m.active ? 'animate-pulse bg-accent' : 'bg-ink'}`}
                style={{
                  left: `${m.anchor.point.xPct * 100}%`,
                  top: `${m.anchor.point.yPct * 100}%`,
                }}
              >
                {m.n}
              </button>
            </div>
          );
        })}
    </div>
  );
}

/** Build a quote anchor from the current text selection, if it lies inside this page. */
function selectionAnchor(
  n: number,
  vp: PageViewport,
  pageEl: HTMLElement,
  textEl: HTMLElement,
): PdfAnchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!textEl.contains(range.commonAncestorContainer)) return null;
  const exact = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!exact) return null;
  const pr = pageEl.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).filter((r) => r.width && r.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left)) - pr.left;
  const top = Math.min(...rects.map((r) => r.top)) - pr.top;
  const right = Math.max(...rects.map((r) => r.right)) - pr.left;
  const bottom = Math.max(...rects.map((r) => r.bottom)) - pr.top;
  const [x1, y1] = vp.convertToPdfPoint(left, top) as [number, number];
  const [x2, y2] = vp.convertToPdfPoint(right, bottom) as [number, number];
  const all = (textEl.textContent ?? '').replace(/\s+/g, ' ');
  const at = all.indexOf(exact);
  return {
    kind: 'pdf',
    page: n,
    textQuote: {
      exact,
      prefix: at >= 0 ? all.slice(Math.max(0, at - CTX), at) : '',
      suffix: at >= 0 ? all.slice(at + exact.length, at + exact.length + CTX) : '',
    },
    rectPdf: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    },
    point: {
      xPct: clamp01((left + right) / 2 / pr.width),
      yPct: clamp01(top / pr.height),
    },
  };
}

function viewportRect(vp: PageViewport, r: PdfAnchor['rectPdf']): number[] {
  const [a, b] = vp.convertToViewportPoint(r.x, r.y) as [number, number];
  const [c, d] = vp.convertToViewportPoint(r.x + r.w, r.y + r.h) as [number, number];
  return [a, b, c, d];
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}
