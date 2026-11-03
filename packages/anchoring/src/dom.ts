import type { DomAnchor, ElementDescriptor, TextQuote, ViewportAnchor } from '@ft/shared/anchor';
import { normalizeWhitespace } from './text';

/**
 * DOM anchoring (SPEC §4.1, §4.3). Runs in the overlay (real browsers) and in jsdom tests.
 * Never relies on a CSS selector alone.
 */

export const CANDIDATE_SELECTOR =
  'h1,h2,h3,h4,h5,h6,p,li,img,figure,video,a,button,[role],section,article,blockquote,figcaption,td,th,label,dt,dd,pre,svg,canvas,picture';

const MAX_QUOTE = 300;
const CTX = 32;

function textOf(el: Element): string {
  return normalizeWhitespace(el.textContent ?? '');
}

/** Pick the meaningful element for a tap: the nearest candidate ancestor that isn't a huge container. */
export function meaningfulTarget(el: Element): Element {
  let cur: Element | null = el;
  while (cur && cur !== el.ownerDocument.body) {
    if (cur.matches(CANDIDATE_SELECTOR) && !/^(SECTION|ARTICLE)$/.test(cur.tagName)) return cur;
    if (cur.matches('section,article') && textOf(cur).length <= MAX_QUOTE) return cur;
    cur = cur.parentElement;
  }
  return el;
}

function bodyTextBefore(el: Element): string {
  const doc = el.ownerDocument;
  try {
    const r = doc.createRange();
    r.setStart(doc.body, 0);
    r.setEndBefore(el);
    return normalizeWhitespace(r.toString());
  } catch {
    return '';
  }
}
function bodyTextAfter(el: Element): string {
  const doc = el.ownerDocument;
  try {
    const r = doc.createRange();
    r.setStartAfter(el);
    r.setEnd(doc.body, doc.body.childNodes.length);
    return normalizeWhitespace(r.toString());
  } catch {
    return '';
  }
}

export function textQuoteFor(el: Element): TextQuote | null {
  const exact = textOf(el).slice(0, MAX_QUOTE);
  if (!exact) return null;
  return { exact, prefix: bodyTextBefore(el).slice(-CTX), suffix: bodyTextAfter(el).slice(0, CTX) };
}

function headingContext(el: Element): string | null {
  const heads = Array.from(el.ownerDocument.querySelectorAll('h1,h2,h3'));
  let best: Element | null = null;
  for (const h of heads) {
    if (h === el) continue;
    const pos = h.compareDocumentPosition(el);
    if (pos & 4 /* FOLLOWING */ || pos & 16 /* CONTAINED_BY */) best = h;
  }
  return best ? textOf(best).slice(0, 200) : null;
}

function basename(src: string | null): string | null {
  if (!src) return null;
  try {
    const p = new URL(src, 'https://x/').pathname;
    return p.split('/').filter(Boolean).pop()?.slice(0, 200) ?? null;
  } catch {
    return null;
  }
}

export function describe(el: Element): ElementDescriptor {
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 200) ?? null,
    imgAlt: img?.getAttribute('alt')?.slice(0, 200) ?? null,
    imgSrcBasename: basename(img?.getAttribute('src') ?? null),
    headingContext: headingContext(el),
  };
}

const AUTO_ID = /^(?:[a-z]+-)?[0-9a-f]{6,}$|\d{3,}|^:r/i;
function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(s)
    : s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  const doc = el.ownerDocument;
  while (cur && cur !== doc.documentElement && parts.length < 12) {
    if (
      cur.id &&
      !AUTO_ID.test(cur.id) &&
      doc.querySelectorAll(`#${cssEscape(cur.id)}`).length === 1
    ) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    if (tag === 'body') {
      parts.unshift('body');
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    cur = parent;
  }
  return parts.join(' > ').slice(0, 2000);
}

export function nthPath(el: Element): string {
  const idx: number[] = [];
  let cur: Element | null = el;
  const body = el.ownerDocument.body;
  while (cur && cur !== body) {
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    idx.unshift(Array.from(parent.children).indexOf(cur));
    cur = parent;
  }
  return idx.join('/');
}

export function byNthPath(doc: Document, path: string): Element | null {
  if (!path) return null;
  let cur: Element | null = doc.body;
  for (const i of path.split('/').map(Number)) {
    cur = cur?.children[i] ?? null;
    if (!cur) return null;
  }
  return cur;
}

export type PageInfo = { pageUrl: string; pagePath: string };

export function buildDomAnchor(
  el: Element,
  page: PageInfo,
  clientX?: number,
  clientY?: number,
): DomAnchor {
  const win = el.ownerDocument.defaultView!;
  const r = el.getBoundingClientRect();
  const sx = win.scrollX || 0;
  const sy = win.scrollY || 0;
  const xPct = r.width && clientX !== undefined ? clamp01((clientX - r.left) / r.width) : 0.5;
  const yPct = r.height && clientY !== undefined ? clamp01((clientY - r.top) / r.height) : 0.5;
  return {
    kind: 'dom',
    pageUrl: page.pageUrl,
    pagePath: page.pagePath,
    textQuote: textQuoteFor(el),
    elementDescriptor: describe(el),
    cssPath: cssPath(el),
    nthPath: nthPath(el),
    rectDoc: { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height },
    viewport: { w: win.innerWidth || 1, h: win.innerHeight || 1, dpr: win.devicePixelRatio || 1 },
    scroll: { x: sx, y: sy },
    point: { xPct, yPct },
  };
}

export function buildViewportAnchor(doc: Document, page: PageInfo, sample: string): ViewportAnchor {
  const win = doc.defaultView!;
  return {
    kind: 'viewport',
    pageUrl: page.pageUrl,
    pagePath: page.pagePath,
    scroll: { x: win.scrollX || 0, y: win.scrollY || 0 },
    viewport: { w: win.innerWidth || 1, h: win.innerHeight || 1, dpr: win.devicePixelRatio || 1 },
    visibleTextSample: normalizeWhitespace(sample).slice(0, 300),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
}

// ------------------------------------------------------------------ re-anchoring

export type LocateResult =
  | { method: 'textQuote' | 'cssPath'; element: Element }
  | { method: 'rect'; element: Element | null; rect: DomAnchor['rectDoc'] }
  | { method: 'none' };

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  );
}
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return a === b ? 1 : 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function contextScore(el: Element, q: TextQuote): number {
  let s = 0;
  if (q.prefix) s += similarity(bodyTextBefore(el).slice(-CTX), q.prefix);
  if (q.suffix) s += similarity(bodyTextAfter(el).slice(0, CTX), q.suffix);
  return s;
}

function descriptorMatches(el: Element, d: ElementDescriptor, q: TextQuote | null): boolean {
  if (el.tagName.toLowerCase() !== d.tag) return false;
  const cur = describe(el);
  if (d.imgSrcBasename && cur.imgSrcBasename === d.imgSrcBasename) return true;
  if (d.imgAlt && cur.imgAlt === d.imgAlt) return true;
  if (q?.exact) return similarity(textOf(el), q.exact) >= 0.5;
  if (d.ariaLabel) return cur.ariaLabel === d.ariaLabel;
  return !d.imgSrcBasename && !d.imgAlt;
}

/** Find the element an anchor refers to, in SPEC §4.3 order. */
export function locate(anchor: DomAnchor, doc: Document): LocateResult {
  const d = anchor.elementDescriptor;
  const q = anchor.textQuote;
  const hint = safeQuery(doc, anchor.cssPath);

  // 1. textQuote: exact match first, then fuzzy; disambiguate by context and proximity to cssPath.
  if (q?.exact) {
    const pool = Array.from(doc.body.querySelectorAll(d.tag || '*'));
    const exact = pool.filter((el) => textOf(el).slice(0, MAX_QUOTE) === q.exact);
    const fuzzy = exact.length
      ? exact
      : pool.filter((el) => {
          const t = textOf(el);
          return (
            t.length > 0 && t.length < 4 * q.exact.length + 40 && similarity(t, q.exact) >= 0.6
          );
        });
    if (fuzzy.length) {
      const scored = fuzzy.map((el) => ({
        el,
        score:
          contextScore(el, q) +
          (exact.length ? 1 : similarity(textOf(el), q.exact)) +
          (hint && (hint === el || hint.contains(el) || el.contains(hint)) ? 0.5 : 0),
      }));
      scored.sort((a, b) => b.score - a.score);
      return { method: 'textQuote', element: scored[0]!.el };
    }
  }

  // 2. cssPath / nthPath, only if the element still looks like the one we anchored.
  for (const el of [hint, byNthPath(doc, anchor.nthPath)]) {
    if (el && descriptorMatches(el, d, q)) return { method: 'cssPath', element: el };
  }
  // Images: look for the same image anywhere on the page.
  if (d.imgSrcBasename || d.imgAlt) {
    const img = Array.from(doc.images).find(
      (i) =>
        (d.imgSrcBasename && basename(i.getAttribute('src')) === d.imgSrcBasename) ||
        (d.imgAlt && i.alt === d.imgAlt),
    );
    if (img)
      return { method: 'cssPath', element: d.tag === 'img' ? img : (img.closest(d.tag) ?? img) };
  }

  // 3. rectDoc, only when the viewport width is the same (±2%).
  const win = doc.defaultView;
  if (win && Math.abs((win.innerWidth || 0) - anchor.viewport.w) <= anchor.viewport.w * 0.02) {
    const r = anchor.rectDoc;
    let el: Element | null = null;
    try {
      el = doc.elementFromPoint(r.x + r.w / 2 - win.scrollX, r.y + r.h / 2 - win.scrollY);
    } catch {
      el = null;
    }
    return { method: 'rect', element: el, rect: r };
  }
  // 4. Caller falls back to the stored screenshot.
  return { method: 'none' };
}

function safeQuery(doc: Document, sel: string): Element | null {
  if (!sel) return null;
  try {
    return doc.querySelector(sel);
  } catch {
    return null;
  }
}
