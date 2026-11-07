import { describe, expect, it } from 'vitest';
import type { Anchor, Timeline, TimelineTap, TranscriptWord } from '@ft/shared';
import {
  cleanText,
  mergeShort,
  resolveDeterministic,
  tapSplit,
  viewSplit,
  type Segment,
} from '@/lib/server/resolve';

const words = (text: string, start = 0, per = 0.5): TranscriptWord[] =>
  text.split(' ').map((w, i) => ({ w, start: start + i * per, end: start + i * per + per * 0.9 }));

const pin = (page: number): Anchor => ({
  kind: 'pdf',
  page,
  textQuote: null,
  rectPdf: { x: 10, y: 20, w: 0, h: 0 },
  point: { xPct: 0.1, yPct: 0.2 },
});
const tap = (t: number, page = 1): TimelineTap => ({ t, eid: null, fullAnchor: pin(page) });
const pageAnchor = (page: number): Anchor => ({ kind: 'pdf-page', page, visibleTextSample: '' });
const timeline = (taps: TimelineTap[] = []): Timeline => ({
  taps,
  snapshots: [0, 2000, 4000, 6000, 8000].map((t) => ({
    t,
    pagePath: `/page/${t < 4000 ? 1 : 2}`,
    scrollY: 0,
    elements: [],
    viewportAnchor: pageAnchor(t < 4000 ? 1 : 2),
  })),
});

// 16 words, one every 0.5 s → word i starts at i*0.5 s
const W = words(
  'the summary is strong and clear this project section really needs dates added to it please',
);

describe('tapSplit (SPEC §5.2 step 1)', () => {
  it('starts a segment at the first word with start ≥ tap − 0.3 s', () => {
    const segs = tapSplit(W, [tap(3000)]); // 3.0 s → 2.7 s → word 6 ("this" at 3.0)
    expect(segs.map((s) => [s.from, s.to, s.source])).toEqual([
      [0, 6, 'viewport'],
      [6, 16, 'tap'],
    ]);
  });
  it('a tap slightly after the word still catches it (0.3 s lead)', () => {
    expect(tapSplit(W, [tap(3200)])[1]!.from).toBe(6);
  });
  it('speech before the first tap is segment 0; taps after all speech are ignored', () => {
    expect(tapSplit(W, [tap(60_000)])).toHaveLength(1);
  });
  it('two taps on the same word: the later tap wins', () => {
    const segs = tapSplit(W, [tap(2900, 1), tap(3000, 2)]);
    expect(segs[1]!.anchor).toEqual(pin(2));
  });
});

describe('mergeShort (step 5)', () => {
  const seg = (from: number, to: number, tapped = false): Segment => ({
    from,
    to,
    tap: tapped ? tap(0) : null,
    anchor: tapped ? pin(1) : pageAnchor(1),
    source: tapped ? 'tap' : 'viewport',
  });
  it('merges segments under 3 words into the previous one', () => {
    expect(mergeShort([seg(0, 5), seg(5, 7), seg(7, 12)]).map((s) => [s.from, s.to])).toEqual([
      [0, 7],
      [7, 12],
    ]);
  });
  it('a short first segment merges forward', () => {
    expect(mergeShort([seg(0, 2), seg(2, 8)]).map((s) => [s.from, s.to])).toEqual([[0, 8]]);
  });
  it('a tap is kept when its segment merges with an untapped one', () => {
    expect(mergeShort([seg(0, 2), seg(2, 8, true)])[0]!.source).toBe('tap');
  });
});

describe('resolveDeterministic', () => {
  it('tap segments keep the tap anchor; others get the nearest viewport anchor', () => {
    const out = resolveDeterministic('rec123', W, timeline([tap(3000, 2)]));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      clientId: 'rec123-0',
      text: 'The summary is strong and clear',
      transcriptOriginal: 'the summary is strong and clear',
      source: 'viewport',
      anchor: pageAnchor(1), // midpoint ≈ 1.5 s → snapshot at 2 s (page 1)
      startMs: 0,
    });
    expect(out[1]).toMatchObject({ source: 'tap', anchor: pin(2), startMs: 3000 });
  });
  it('never changes the words, only whitespace and the first capital', () => {
    const out = resolveDeterministic('rec123', W, timeline([tap(3000)]));
    expect(out.map((c) => c.transcriptOriginal).join(' ')).toBe(W.map((w) => w.w).join(' '));
    expect(cleanText('  hello   world ')).toBe('Hello world');
  });
  it('empty transcript → no comments', () => {
    expect(resolveDeterministic('rec123', [], timeline())).toEqual([]);
  });
});

describe('viewSplit: untapped talk follows where the reviewer was looking', () => {
  const view = (y: number, path = '/'): Anchor => ({
    kind: 'viewport',
    pageUrl: `https://example.com${path}`,
    pagePath: path,
    scroll: { x: 0, y },
    viewport: { w: 390, h: 800, dpr: 3 },
    visibleTextSample: '',
  });
  // scrollY by second: top for 0–5 s, then scrolled 1,000 px down from 6 s on.
  const scrolled = (ys: (s: number) => number, path = (_s: number) => '/'): Timeline => ({
    taps: [],
    snapshots: Array.from({ length: 13 }, (_, s) => ({
      t: s * 1000,
      pagePath: path(s),
      scrollY: ys(s),
      elements: [],
      viewportAnchor: view(ys(s), path(s)),
    })),
  });
  // 24 words, 0.5 s apart; "um" at word 9 (ends a thought), a pause before word 14.
  const talk = (): TranscriptWord[] => {
    const ws = words(
      'the hero image is lovely and loads fast too um the project cards need short descriptions under each title please',
    );
    return ws.map((w, i) => (i >= 14 ? { ...w, start: w.start + 0.6, end: w.end + 0.6 } : w));
  };
  const untapped = (n: number): Segment[] => [
    { from: 0, to: n, tap: null, anchor: null, source: 'viewport' },
  ];

  it('splits after "um" near the scroll and pins each piece to what was on screen', () => {
    const W2 = talk();
    const out = resolveDeterministic(
      'r',
      W2,
      scrolled((s) => (s < 6 ? 0 : 1000)),
    );
    expect(out.map((c) => c.text)).toEqual([
      'The hero image is lovely and loads fast too um',
      'The project cards need short descriptions under each title please',
    ]);
    expect(out.map((c) => (c.anchor as { scroll: { y: number } }).scroll.y)).toEqual([0, 1000]);
    expect(out.map((c) => c.transcriptOriginal).join(' ')).toBe(W2.map((w) => w.w).join(' '));
  });
  it('a small scroll (under half a screen) keeps one comment', () => {
    const segs = viewSplit(
      talk(),
      untapped(19),
      scrolled((s) => (s < 6 ? 0 : 300)),
    );
    expect(segs).toHaveLength(1);
  });
  it('moving to another page splits too', () => {
    const segs = viewSplit(
      talk(),
      untapped(19),
      scrolled(
        () => 0,
        (s) => (s < 6 ? '/' : '/work'),
      ),
    );
    expect(segs.map((s) => [s.from, s.to])).toEqual([
      [0, 10],
      [10, 19],
    ]);
  });
  it('never cuts pieces shorter than a short sentence, and leaves anchored segments alone', () => {
    const W2 = talk();
    const jumpy = scrolled((s) => (s % 2 ? 2000 : 0)); // scrolling up and down every second
    for (const s of viewSplit(W2, untapped(19), jumpy))
      expect(s.to - s.from).toBeGreaterThanOrEqual(8);
    const tapped: Segment[] = [{ from: 0, to: 19, tap: tap(0), anchor: pin(1), source: 'tap' }];
    expect(viewSplit(W2, tapped, jumpy)).toEqual(tapped);
  });
});
