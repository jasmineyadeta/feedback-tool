import { describe, expect, it, vi } from 'vitest';
import type { Anchor } from '@ft/shared';

vi.mock('server-only', () => ({}));
const { screenshotGroups } = await import('@/lib/server/site-screens');

const dom = (pagePath: string, w: number): Anchor => ({
  kind: 'dom',
  pageUrl: `https://a.example${pagePath}`,
  pagePath,
  textQuote: null,
  elementDescriptor: {
    tag: 'p',
    role: null,
    ariaLabel: null,
    imgAlt: null,
    imgSrcBasename: null,
    headingContext: null,
  },
  cssPath: 'p',
  nthPath: 'p',
  rectDoc: { x: 0, y: 0, w: 10, h: 10 },
  viewport: { w, h: 800, dpr: 2 },
  scroll: { x: 0, y: 0 },
  point: { xPct: 0.5, yPct: 0.5 },
});

describe('screenshotGroups (one capture per page × reviewer width)', () => {
  it('groups comments on the same page and width, and skips non-website anchors', () => {
    const g = screenshotGroups([
      { id: 'a', anchor: dom('/', 390) },
      { id: 'b', anchor: dom('/', 390) },
      { id: 'c', anchor: dom('/work', 390) },
      { id: 'd', anchor: dom('/', 1280) },
      { id: 'e', anchor: { kind: 'pdf-page', page: 1, visibleTextSample: '' } },
      { id: 'f', anchor: null },
    ]);
    expect(g.map((x) => [x.pagePath, x.width, x.ids])).toEqual([
      ['/', 390, ['a', 'b']],
      ['/work', 390, ['c']],
      ['/', 1280, ['d']],
    ]);
  });
  it('clamps silly viewport sizes', () => {
    const [g] = screenshotGroups([{ id: 'a', anchor: dom('/', 5000) }]);
    expect([g!.width, g!.height]).toEqual([1600, 800]);
  });
});
