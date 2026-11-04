import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { AnchorResolver, Anchor, Timeline, TranscriptWord } from '@ft/shared';
import { validateSpans } from '@/lib/server/validate-spans';
import { resolveWithAI } from '@/lib/server/resolve';

const N = 30;
const words: TranscriptWord[] = Array.from({ length: N }, (_, i) => ({
  w: `w${i}`,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const lineAnchor = (eid: string): Anchor => ({
  kind: 'pdf',
  page: 1,
  textQuote: { exact: eid, prefix: '', suffix: '' },
  rectPdf: { x: 0, y: 0, w: 10, h: 10 },
  point: { xPct: 0.1, yPct: 0.1 },
});
// Every second: lines e0..e4 visible; e9 is only visible at t=60s (far outside the recording).
const timeline: Timeline = {
  taps: [],
  snapshots: [
    ...Array.from({ length: 16 }, (_, t) => ({
      t: t * 1000,
      pagePath: '/page/1',
      scrollY: 0,
      elements: ['e0', 'e1', 'e2', 'e3', 'e4'].map((eid) => ({
        eid,
        tag: 'pdf-line',
        text: eid,
        alt: null,
        rectViewport: { x: 0, y: 0, w: 1, h: 1 },
        cssPath: '',
        anchor: lineAnchor(eid),
      })),
      viewportAnchor: { kind: 'pdf-page' as const, page: 1, visibleTextSample: '' },
    })),
    {
      t: 60_000,
      pagePath: '/page/1',
      scrollY: 0,
      elements: [
        {
          eid: 'e9',
          tag: 'pdf-line',
          text: 'e9',
          alt: null,
          rectViewport: { x: 0, y: 0, w: 1, h: 1 },
          cssPath: '',
        },
      ],
      viewportAnchor: { kind: 'pdf-page' as const, page: 1, visibleTextSample: '' },
    },
  ],
};

/** Random valid partition of [first, last] into spans. */
const validOutput = fc
  .tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 19 }))
  .chain(([first, len]) => {
    const last = first + len;
    const cutsArb =
      len === 0
        ? fc.constant<number[]>([])
        : fc.uniqueArray(fc.integer({ min: first + 1, max: last }), { maxLength: len });
    return cutsArb.chain((cuts) =>
      fc
        .array(fc.constantFrom('e0', 'e1', 'e2', 'e3', 'e4', null), {
          minLength: cuts.length + 1,
          maxLength: cuts.length + 1,
        })
        .map((eids) => {
          const starts = [first, ...cuts.sort((a, b) => a - b)];
          const spans = starts.map((s, i) => ({
            startWord: s,
            endWord: (starts[i + 1] ?? last + 1) - 1,
            eid: eids[i]!,
            confidence: 0.9,
          }));
          return { seg: { first, last }, out: { spans } };
        }),
    );
  });

describe('validateSpans (SPEC §5.2 step 3)', () => {
  it('accepts any in-order, contiguous partition with visible eids', () => {
    fc.assert(
      fc.property(validOutput, ({ seg, out }) => {
        expect(validateSpans(out, seg, words, timeline).ok).toBe(true);
      }),
    );
  });

  it('rejects a missing word (gap or short coverage)', () => {
    fc.assert(
      fc.property(validOutput, fc.nat(), ({ seg, out }, k) => {
        const spans = out.spans.map((s) => ({ ...s }));
        const i = k % spans.length;
        if (spans[i]!.endWord > spans[i]!.startWord) spans[i]!.endWord -= 1;
        else if (i === spans.length - 1) spans.pop();
        else spans[i + 1]!.startWord += 1;
        if (!spans.length) return;
        expect(validateSpans({ spans }, seg, words, timeline).ok).toBe(false);
      }),
    );
  });

  it('rejects duplicated / overlapping words', () => {
    fc.assert(
      fc.property(validOutput, fc.nat(), ({ seg, out }, k) => {
        const spans = out.spans.map((s) => ({ ...s }));
        const i = k % spans.length;
        spans.splice(i + 1, 0, { ...spans[i]! }); // duplicate a span
        expect(validateSpans({ spans }, seg, words, timeline).ok).toBe(false);
      }),
    );
  });

  it('rejects spans running past the segment, reversed spans, and reordering', () => {
    fc.assert(
      fc.property(validOutput, ({ seg, out }) => {
        const past = out.spans.map((s) => ({ ...s }));
        past[past.length - 1]!.endWord = seg.last + 1;
        expect(validateSpans({ spans: past }, seg, words, timeline).ok).toBe(false);
        const reversed = [
          { startWord: seg.first, endWord: seg.first - 1, eid: null, confidence: 1 },
        ];
        expect(validateSpans({ spans: reversed }, seg, words, timeline).ok).toBe(false);
        if (out.spans.length > 1) {
          const swapped = [...out.spans].reverse();
          expect(validateSpans({ spans: swapped }, seg, words, timeline).ok).toBe(false);
        }
      }),
    );
  });

  it('rejects invented eids and eids not on screen at that time', () => {
    const seg = { first: 0, last: 5 };
    const span = (eid: string) => ({ spans: [{ startWord: 0, endWord: 5, eid, confidence: 0.9 }] });
    expect(validateSpans(span('e2'), seg, words, timeline).ok).toBe(true);
    expect(validateSpans(span('made-up'), seg, words, timeline)).toEqual({
      ok: false,
      reason: 'unknown_eid',
    });
    expect(validateSpans(span('e9'), seg, words, timeline).ok).toBe(false); // only at t=60s
  });

  it('rejects anything that is not the schema (including reworded text instead of indices)', () => {
    const seg = { first: 0, last: 3 };
    for (const bad of [
      null,
      'w0 w1 w2 w3',
      { spans: [{ text: 'w0 w1 w2 w3', eid: 'e1', confidence: 1 }] },
      { spans: [{ startWord: '0', endWord: 3, eid: null, confidence: 1 }] },
      { spans: [{ startWord: 0, endWord: 3, eid: null, confidence: 7 }] },
      { spans: [] },
    ])
      expect(validateSpans(bad, seg, words, timeline).ok).toBe(false);
  });
});

describe('resolveWithAI', () => {
  const tapped: Timeline = {
    ...timeline,
    taps: [{ t: 5000, eid: null, fullAnchor: lineAnchor('tapped') }],
  };

  it('tap overrides AI: tapped segments are never sent to the model', async () => {
    const seen: number[] = [];
    const greedy: AnchorResolver = {
      name: 'greedy',
      async resolve(input) {
        seen.push(input.firstWord);
        // Tries to claim every word, including the tapped segment's.
        return { spans: [{ startWord: 0, endWord: N - 1, eid: 'e1', confidence: 0.99 }] };
      },
    };
    const { proposed, stats } = await resolveWithAI('rec123', words, tapped, greedy);
    expect(seen).toEqual([0]); // only the untapped segment before the tap
    expect(stats.rejected).toEqual(['out_of_range']); // its over-reach is rejected
    const tapComment = proposed.find((p) => p.source === 'tap')!;
    expect(tapComment.anchor).toEqual(lineAnchor('tapped'));
    expect(proposed.map((p) => p.transcriptOriginal).join(' ')).toBe(
      words.map((w) => w.w).join(' '),
    );
  });

  it('valid AI output places spans on the element; low confidence falls back to the viewport', async () => {
    const ai: AnchorResolver = {
      name: 'ai',
      async resolve({ firstWord, lastWord }) {
        const mid = firstWord + 10;
        return {
          spans: [
            { startWord: firstWord, endWord: mid - 1, eid: 'e3', confidence: 0.9 },
            { startWord: mid, endWord: lastWord, eid: 'e4', confidence: 0.3 },
          ],
        };
      },
    };
    const { proposed } = await resolveWithAI('rec123', words, timeline, ai);
    expect(proposed.map((p) => [p.source, p.anchor?.kind])).toEqual([
      ['ai', 'pdf'],
      ['viewport', 'pdf-page'],
    ]);
    expect(proposed[0]!.anchor).toEqual(lineAnchor('e3'));
  });

  it('resolver errors propagate (so the recording retries) unless fallback is on', async () => {
    const down: AnchorResolver = {
      name: 'down',
      resolve: () => Promise.reject(new Error('ollama down')),
    };
    await expect(resolveWithAI('rec123', words, timeline, down)).rejects.toThrow('ollama down');
    const { proposed, stats } = await resolveWithAI('rec123', words, timeline, down, {
      fallbackOnError: true,
    });
    expect(stats.rejected).toEqual(['resolver_error']);
    expect(proposed[0]!.source).toBe('viewport');
  });
});
