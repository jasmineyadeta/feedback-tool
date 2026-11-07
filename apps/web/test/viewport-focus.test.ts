import { describe, expect, it, vi } from 'vitest';
import type { DomAnchor, TimelineSnapshot } from '@ft/shared';

vi.mock('server-only', () => ({}));
const { focusElement, resolveDeterministic } = await import('@/lib/server/resolve');
const { cleanAnchor } = await import('@/lib/server/reviewer');

const dom = (exact: string, pageUrl = 'http://localhost:8788/x/'): DomAnchor => ({
  kind: 'dom',
  pageUrl,
  pagePath: '/',
  textQuote: { exact, prefix: '', suffix: '' },
  elementDescriptor: {
    tag: 'p',
    role: null,
    ariaLabel: null,
    imgAlt: null,
    imgSrcBasename: null,
    headingContext: null,
  },
  cssPath: 'p',
  nthPath: '',
  rectDoc: { x: 0, y: 0, w: 10, h: 10 },
  viewport: { w: 400, h: 800, dpr: 1 },
  scroll: { x: 0, y: 0 },
  point: { xPct: 0.5, yPct: 0.5 },
});
const el = (text: string, y: number, h: number, w = 360) => ({
  eid: text,
  tag: 'p',
  text,
  alt: null,
  rectViewport: { x: 20, y, w, h },
  cssPath: '',
  anchor: dom(text),
});
const snap = (elements: ReturnType<typeof el>[]): TimelineSnapshot => ({
  t: 0,
  pagePath: '/',
  scrollY: 900,
  elements,
  viewportAnchor: {
    kind: 'viewport',
    pageUrl: 'http://localhost:8788/x/',
    pagePath: '/',
    scroll: { x: 0, y: 900 },
    viewport: { w: 400, h: 800, dpr: 1 },
    visibleTextSample: '',
  },
});

describe('focusElement: what was in the middle of the screen', () => {
  it('picks the smallest wide element across the centre line', () => {
    const s = snap([el('section', 0, 800), el('card', 300, 250), el('tiny', 395, 10)]);
    expect(focusElement(s)?.textQuote?.exact).toBe('card');
  });
  it('ignores narrow elements across the centre', () => {
    const s = snap([el('narrow', 300, 250, 50), el('wide', 200, 500)]);
    expect(focusElement(s)?.textQuote?.exact).toBe('wide');
  });
  it('falls back to the element nearest the centre', () => {
    const s = snap([el('top', 0, 100), el('lower', 450, 100)]);
    expect(focusElement(s)?.textQuote?.exact).toBe('lower');
  });
  it('untapped talk gets a viewport anchor carrying that element', () => {
    const words = 'the cards here need short descriptions'
      .split(' ')
      .map((w, i) => ({ w, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const [c] = resolveDeterministic('r', words, {
      taps: [],
      snapshots: [snap([el('card', 300, 250)])],
    });
    expect(c!.anchor).toMatchObject({ kind: 'viewport', focus: { textQuote: { exact: 'card' } } });
  });
});

describe('cleanAnchor', () => {
  it('never stores the proxy address, including inside the mid-screen element', () => {
    const a = snap([]).viewportAnchor;
    if (a.kind !== 'viewport') throw new Error('fixture');
    const out = cleanAnchor({ site_url: 'https://ada.example/' }, { ...a, focus: dom('card') });
    expect(JSON.stringify(out)).not.toContain('8788');
    expect(out).toMatchObject({
      pageUrl: 'https://ada.example/',
      focus: { pageUrl: 'https://ada.example/' },
    });
  });
});
