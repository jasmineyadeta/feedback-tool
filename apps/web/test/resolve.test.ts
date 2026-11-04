import { describe, expect, it } from 'vitest';
import type { Anchor, Timeline, TimelineTap, TranscriptWord } from '@ft/shared';
import {
  cleanText,
  mergeShort,
  resolveDeterministic,
  tapSplit,
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
