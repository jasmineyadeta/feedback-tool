import type { PdfAnchor, PdfPageAnchor, TimelineSnapshot, VisibleElement } from '@ft/shared';

/**
 * PDF timeline capture (SPEC §5.3): every second while recording, the visible pages and their text
 * lines (pdf.js text-layer spans grouped by line). Each line carries a full quote anchor so the server
 * can turn an AI pick (by `eid`) into a real anchor. `eid` = `p{page}-l{line}`, stable per page.
 */
const MAX_ELEMENTS = 40;

type Line = { top: number; bottom: number; left: number; right: number; text: string };

function linesOf(pageEl: HTMLElement): Line[] {
  const spans = Array.from(pageEl.querySelectorAll<HTMLElement>('.textLayer span'));
  const lines: Line[] = [];
  for (const s of spans) {
    const text = s.textContent ?? '';
    if (!text.trim()) continue;
    const r = s.getBoundingClientRect();
    const line = lines.find((l) => Math.abs(l.top - r.top) < Math.max(3, r.height / 2));
    if (line) {
      line.text += (line.right < r.left - 1 ? ' ' : '') + text;
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, text });
  }
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
}

function toPdfRect(pageEl: HTMLElement, l: Line): PdfAnchor['rectPdf'] {
  const pr = pageEl.getBoundingClientRect();
  const [x0, y0, x1, y1] = (pageEl.dataset.pdfBox ?? '0,0,612,792').split(',').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const sx = (x1 - x0) / pr.width;
  const sy = (y1 - y0) / pr.height;
  return {
    x: x0 + (l.left - pr.left) * sx,
    y: y1 - (l.bottom - pr.top) * sy,
    w: Math.max(0, (l.right - l.left) * sx),
    h: Math.max(0, (l.bottom - l.top) * sy),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));

export function snapshotPdf(scroller: HTMLElement, t: number): TimelineSnapshot | null {
  const view = scroller.getBoundingClientRect();
  const mid = view.top + view.height / 2;
  const pages = Array.from(scroller.querySelectorAll<HTMLElement>('[data-page]')).filter((p) => {
    const r = p.getBoundingClientRect();
    return r.bottom > view.top && r.top < view.bottom;
  });
  if (!pages.length) return null;
  const current =
    pages.find((p) => {
      const r = p.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    }) ?? pages[0]!;

  const elements: VisibleElement[] = [];
  const sample: string[] = [];
  for (const pageEl of pages) {
    const n = Number(pageEl.dataset.page);
    const pr = pageEl.getBoundingClientRect();
    const lines = linesOf(pageEl);
    lines.forEach((l, i) => {
      if (l.bottom < view.top || l.top > view.bottom || elements.length >= MAX_ELEMENTS) return;
      const text = l.text.slice(0, 300);
      if (pageEl === current) sample.push(text);
      const anchor: PdfAnchor = {
        kind: 'pdf',
        page: n,
        textQuote: {
          exact: text,
          prefix: (lines[i - 1]?.text ?? '').slice(-32),
          suffix: (lines[i + 1]?.text ?? '').slice(0, 32),
        },
        rectPdf: toPdfRect(pageEl, l),
        point: {
          xPct: clamp01((l.left - pr.left) / pr.width),
          yPct: clamp01((l.top - pr.top) / pr.height),
        },
      };
      elements.push({
        eid: `p${n}-l${i}`,
        tag: 'pdf-line',
        text: text.slice(0, 160),
        alt: null,
        rectViewport: {
          x: l.left - view.left,
          y: l.top - view.top,
          w: l.right - l.left,
          h: l.bottom - l.top,
        },
        cssPath: '',
        anchor,
      });
    });
  }
  const page = Number(current.dataset.page);
  const cr = current.getBoundingClientRect();
  const viewportAnchor: PdfPageAnchor = {
    kind: 'pdf-page',
    page,
    visibleTextSample: sample.join(' ').slice(0, 300),
    // What part of the page was on screen, as fractions (independent of zoom and screen size).
    region: {
      top: clamp01((view.top - cr.top) / cr.height),
      bottom: clamp01((view.bottom - cr.top) / cr.height),
    },
  };
  return {
    t: Math.max(0, Math.round(t)),
    pagePath: `/page/${page}`,
    scrollY: Math.round(scroller.scrollTop),
    elements,
    viewportAnchor,
  };
}
