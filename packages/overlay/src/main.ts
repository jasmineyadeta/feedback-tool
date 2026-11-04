/**
 * Overlay injected first in <head> of every proxied document (SPEC §6).
 * - Keeps the site working under the proxy (history patch, SW + form blocking).
 * - Talks to the app shell only via postMessage, origin-checked + zod-validated both ways.
 * - Capture mode (recording) and pick mode (typed comment): taps become anchors, site clicks suppressed.
 */
import { parseShellMessage, type OverlayToShell, type ShellToOverlay } from '@ft/shared/protocol';
import type { Anchor, DomAnchor } from '@ft/shared/anchor';
import type { TimelineSnapshot, VisibleElement } from '@ft/shared/timeline';
import {
  buildDomAnchor,
  buildViewportAnchor,
  CANDIDATE_SELECTOR,
  locate,
  meaningfulTarget,
} from '@ft/anchoring';
import { OVERLAY_VERSION } from './version';

type Cfg = { app: string; proxy: string; upstreamOrigin: string; etld1: string };
const w = window as unknown as { __FT_CFG?: Cfg; __ftOverlay?: string };
const cfg = w.__FT_CFG;
w.__ftOverlay = OVERLAY_VERSION;

const inFrame = window.parent !== window;
function post(msg: OverlayToShell) {
  if (cfg && inFrame) window.parent.postMessage(msg, cfg.app);
}
const page = () => ({ pageUrl: location.href, pagePath: location.pathname || '/' });

// ---------------------------------------------------------------- keep the site working
if (cfg) {
  // pushState/replaceState: relative URLs resolve against <base> (the upstream origin), which would
  // throw a cross-origin SecurityError. Normalize anything on the upstream origin to the proxy origin.
  const normalize = (url: string | URL | null | undefined): string | URL | null | undefined => {
    if (url == null) return url;
    try {
      const u = new URL(String(url), cfg.upstreamOrigin + location.pathname + location.search);
      if (u.origin === cfg.upstreamOrigin || u.origin === location.origin)
        return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* fall through */
    }
    return url;
  };
  // Resolve relative to the proxy page, not <base>: create absolute proxy URLs.
  const toProxyAbs = (u: string | URL | null | undefined) => {
    const n = normalize(u);
    return typeof n === 'string' && n.startsWith('/') ? location.origin + n : n;
  };
  for (const name of ['pushState', 'replaceState'] as const) {
    const orig = history[name].bind(history);
    history[name] = (data: unknown, unused: string, url?: string | URL | null) => {
      orig(data, unused, toProxyAbs(url));
      reportNav();
    };
  }
  window.addEventListener('popstate', () => reportNav());

  if ('serviceWorker' in navigator) {
    try {
      Object.defineProperty(navigator.serviceWorker, 'register', {
        value: () =>
          Promise.reject(
            new DOMException('Service workers are disabled in review mode', 'SecurityError'),
          ),
      });
    } catch {
      /* ignore */
    }
  }
  document.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Forms are turned off while reviewing.');
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[data-ft-external]');
      if (a && mode === 'browse') {
        try {
          post({
            ft: 1,
            type: 'external-link',
            host: new URL((a as HTMLAnchorElement).href).hostname,
          });
        } catch {
          /* ignore */
        }
      }
    },
    true,
  );
}

let lastPath = '';
function reportNav() {
  const p = location.pathname;
  if (p === lastPath) return;
  lastPath = p;
  post({ ft: 1, type: 'nav', pagePath: p, title: document.title.slice(0, 300) });
  if (mode === 'record') queueMicrotask(snapshot);
}

// ---------------------------------------------------------------- modes
type Mode = 'browse' | 'record' | 'pick';
let mode: Mode = 'browse';
let baseline = 0; // shell's performance.now() at rec start, mapped onto our clock
let tick: number | undefined;
let tapCount = 0;

const eids = new WeakMap<Element, string>();
let eidSeq = 0;
const eidEls = new Map<string, Element>();
function eidOf(el: Element): string {
  let id = eids.get(el);
  if (!id) {
    id = `e${++eidSeq}`;
    eids.set(el, id);
    eidEls.set(id, el);
  }
  return id;
}
const now = () => Math.max(0, Date.now() - baseline);

const SUPPRESS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
];
/** While recording, same-site links still navigate (SPEC §3.2 step 4): they're how reviewers move between pages. */
function isSiteLink(t: EventTarget | null): boolean {
  const a = (t as Element | null)?.closest?.('a[href]');
  if (!a || a.hasAttribute('data-ft-external')) return false;
  const href = a.getAttribute('href') ?? '';
  return !href.startsWith('#') && !/^(javascript|mailto|tel):/i.test(href);
}

function suppress(e: Event) {
  if (mode === 'browse') return;
  if ((e.target as Element | null)?.closest?.('#__ft_root')) return;
  if (mode === 'record' && isSiteLink(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (e.type === 'click') onTap(e as MouseEvent);
}
for (const t of SUPPRESS) window.addEventListener(t, suppress, { capture: true, passive: false });
// touchstart: stop propagation only (no preventDefault) so scrolling still works.
// touchend too: preventDefault there would stop iOS from synthesizing the click we anchor on.
for (const t of ['touchstart', 'touchend'])
  window.addEventListener(t, (e) => mode !== 'browse' && e.stopPropagation(), {
    capture: true,
    passive: true,
  });

function onTap(e: MouseEvent) {
  const raw = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
  if (!raw || raw === document.documentElement || raw === document.body) return;
  anchorElement(meaningfulTarget(raw), e.clientX, e.clientY);
}

// Keyboard (M5): in pick/record mode, Enter on the focused element points at it instead of activating it.
window.addEventListener(
  'keydown',
  (e) => {
    if (mode === 'browse' || e.key !== 'Enter') return;
    const el = document.activeElement;
    if (!el || el === document.body || el.closest('#__ft_root')) return;
    if (mode === 'record' && isSiteLink(el)) return; // links still navigate while recording
    e.preventDefault();
    e.stopImmediatePropagation();
    const r = el.getBoundingClientRect();
    anchorElement(meaningfulTarget(el), r.left + r.width / 2, r.top + r.height / 2);
  },
  { capture: true },
);

function anchorElement(el: Element, x: number, y: number) {
  const anchor = buildDomAnchor(el, page(), x, y);
  if (mode === 'pick') {
    flash(el, '•');
    post({ ft: 1, type: 'anchor:picked', anchor });
    setMode('browse');
    return;
  }
  tapCount++;
  flash(el, String(tapCount));
  post({ ft: 1, type: 'tap', tap: { t: now(), eid: eidOf(el), fullAnchor: anchor } });
}

function setMode(m: Mode) {
  mode = m;
  document.documentElement.toggleAttribute('data-ft-capture', m !== 'browse');
  if (tick) window.clearInterval(tick);
  tick = undefined;
  if (m === 'record') {
    snapshot();
    tick = window.setInterval(snapshot, 1000);
  }
}

// ---------------------------------------------------------------- timeline
function visibleCandidates(): VisibleElement[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: { el: Element; area: number; r: DOMRect }[] = [];
  for (const el of Array.from(document.querySelectorAll(CANDIDATE_SELECTOR))) {
    if (el.closest('#__ft_root')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw)
      continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const alt = el.getAttribute('alt') ?? el.getAttribute('aria-label');
    if (!text && !alt && !/^(IMG|VIDEO|CANVAS|SVG|PICTURE|FIGURE)$/i.test(el.tagName)) continue;
    const area =
      (Math.min(r.bottom, vh) - Math.max(r.top, 0)) * (Math.min(r.right, vw) - Math.max(r.left, 0));
    out.push({ el, area, r });
  }
  out.sort((a, b) => b.area - a.area);
  return out.slice(0, 40).map(({ el, r }) => ({
    eid: eidOf(el),
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    alt: (el.getAttribute('alt') ?? el.getAttribute('aria-label'))?.slice(0, 200) ?? null,
    rectViewport: { x: r.left, y: r.top, w: r.width, h: r.height },
    cssPath: '',
    anchor: buildDomAnchor(el, page()),
  }));
}

function snapshot() {
  const elements = visibleCandidates();
  const sample = elements
    .map((e) => e.text)
    .join(' ')
    .slice(0, 300);
  const snap: TimelineSnapshot = {
    t: now(),
    pagePath: location.pathname || '/',
    scrollY: window.scrollY,
    elements,
    viewportAnchor: buildViewportAnchor(document, page(), sample),
  };
  post({ ft: 1, type: 'timeline', snapshot: snap });
}
let scrollTimer: number | undefined;
window.addEventListener(
  'scroll',
  () => {
    if (mode !== 'record') return;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(snapshot, 200);
  },
  { passive: true },
);

// ---------------------------------------------------------------- UI (shadow DOM, never styled by the site)
let root: ShadowRoot | null = null;
function ui(): ShadowRoot {
  if (root) return root;
  const host = document.createElement('div');
  host.id = '__ft_root';
  host.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .box{position:absolute;border:2px solid #2f5bd3;border-radius:4px;box-shadow:0 0 0 4px rgba(47,91,211,.18);transition:opacity .4s}
    .pulse{animation:p 1.2s ease-out 2}
    @keyframes p{0%{box-shadow:0 0 0 0 rgba(47,91,211,.6)}100%{box-shadow:0 0 0 14px rgba(47,91,211,0)}}
    .num{position:absolute;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#2f5bd3;color:#fff;font:600 12px/22px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}
    .toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#1c1f23;color:#fff;font:14px system-ui,sans-serif;padding:8px 12px;border-radius:6px}`;
  root.appendChild(style);
  return root;
}
function rectBox(r: { x: number; y: number; w: number; h: number }, label: string, cls = '') {
  const s = ui();
  const box = document.createElement('div');
  box.className = `box ${cls}`;
  box.style.cssText = `left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w + 6}px;height:${r.h + 6}px`;
  const num = document.createElement('div');
  num.className = 'num';
  num.textContent = label;
  num.setAttribute('aria-label', `Comment ${label}`);
  num.style.cssText = `left:${r.x - 11}px;top:${r.y - 11}px`;
  s.append(box, num);
  return [box, num];
}
function docRect(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
}
function flash(el: Element, label: string) {
  const nodes = rectBox(docRect(el), label);
  if (mode === 'pick') window.setTimeout(() => nodes.forEach((n) => n.remove()), 1500);
}
function clearMarks() {
  if (!root) return;
  root.querySelectorAll('.box,.num').forEach((n) => n.remove());
}
function toast(text: string) {
  const s = ui();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  s.appendChild(t);
  window.setTimeout(() => t.remove(), 2500);
}

function show(anchor: Anchor, label: string, requestId?: string) {
  let found = false;
  let method: 'textQuote' | 'cssPath' | 'rect' | 'none' = 'none';
  if (anchor.kind === 'dom' && anchor.pagePath === location.pathname) {
    const r = locate(anchor as DomAnchor, document);
    method = r.method;
    if (r.method === 'textQuote' || r.method === 'cssPath') {
      found = true;
      r.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.setTimeout(() => rectBox(docRect(r.element), label, 'pulse'), 350);
    } else if (r.method === 'rect') {
      found = true;
      window.scrollTo({ top: Math.max(0, r.rect.y - window.innerHeight / 3), behavior: 'smooth' });
      rectBox(r.rect, label, 'pulse');
    }
  } else if (anchor.kind === 'viewport' && anchor.pagePath === location.pathname) {
    found = true;
    method = 'rect';
    window.scrollTo({ top: anchor.scroll.y, behavior: 'smooth' });
  }
  if (requestId) post({ ft: 1, type: 'anchor:located', requestId, found, method });
}

// ---------------------------------------------------------------- messages from the shell
window.addEventListener('message', (e: MessageEvent) => {
  if (!cfg || e.origin !== cfg.app || e.source !== window.parent) return;
  const msg: ShellToOverlay | null = parseShellMessage(e.data);
  if (!msg) return;
  switch (msg.type) {
    case 'rec:start':
      baseline = Date.now(); // frames have different performance clocks; message latency is ~ms
      tapCount = 0;
      setMode('record');
      break;
    case 'rec:stop':
      setMode('browse');
      break;
    case 'ping':
      if (document.readyState !== 'loading') ready();
      break;
    case 'pick:start':
      setMode('pick');
      break;
    case 'pick:cancel':
      setMode('browse');
      break;
    case 'anchor:show':
      clearMarks();
      show(msg.anchor, msg.label, msg.requestId);
      break;
    case 'anchor:clear':
      clearMarks();
      break;
    case 'markers:set':
      clearMarks();
      for (const m of msg.markers)
        if (m.anchor.kind === 'dom' && m.anchor.pagePath === location.pathname) {
          const r = locate(m.anchor, document);
          if (r.method === 'textQuote' || r.method === 'cssPath')
            rectBox(docRect(r.element), m.label);
        }
      break;
  }
});

function ready() {
  lastPath = location.pathname;
  post({
    ft: 1,
    type: 'overlay:ready',
    pagePath: location.pathname || '/',
    title: document.title.slice(0, 300),
  });
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', ready, { once: true });
else ready();
window.addEventListener('error', (e) => {
  // Report only that an error happened — never page content.
  if (e.error instanceof Error && /SecurityError/.test(e.error.name))
    post({ ft: 1, type: 'error', code: 'security', message: 'SecurityError in page script' });
});
