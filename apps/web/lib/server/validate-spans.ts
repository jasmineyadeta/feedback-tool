import { ResolverOutput, type Timeline, type TranscriptWord } from '@ft/shared';

/**
 * SPEC §5.2 step 3 — the validator. The model only returns word *indices*; comment text is always
 * rebuilt from the original words, so the AI can't reword anything. This checks the indices:
 * - output matches the schema;
 * - spans are in order, contiguous, non-overlapping and cover exactly the segment's words;
 * - every eid was on screen in a snapshot within the span's time window ±2 s.
 * Any failure rejects the whole AI output for that segment.
 */
export type ValidSpan = { from: number; to: number; eid: string | null; confidence: number };
export type Validation = { ok: true; spans: ValidSpan[] } | { ok: false; reason: string };

const WINDOW_MS = 2000;

export function validateSpans(
  raw: unknown,
  seg: { first: number; last: number }, // inclusive word indices
  words: TranscriptWord[],
  timeline: Timeline,
): Validation {
  const parsed = ResolverOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const spans = parsed.data.spans;
  if (!spans.length) return { ok: false, reason: 'empty' };

  let expect = seg.first;
  for (const s of spans) {
    if (s.startWord !== expect)
      return { ok: false, reason: s.startWord < expect ? 'overlap' : 'gap' };
    if (s.endWord < s.startWord) return { ok: false, reason: 'reversed' };
    if (s.endWord > seg.last) return { ok: false, reason: 'out_of_range' };
    expect = s.endWord + 1;
  }
  if (expect !== seg.last + 1) return { ok: false, reason: 'missing_words' };

  for (const s of spans) {
    if (!s.eid) continue;
    const from = words[s.startWord]!.start * 1000 - WINDOW_MS;
    const to = words[s.endWord]!.end * 1000 + WINDOW_MS;
    const seen = timeline.snapshots.some(
      (snap) => snap.t >= from && snap.t <= to && snap.elements.some((e) => e.eid === s.eid),
    );
    if (!seen) return { ok: false, reason: 'unknown_eid' };
  }
  return {
    ok: true,
    spans: spans.map((s) => ({
      from: s.startWord,
      to: s.endWord + 1,
      eid: s.eid,
      confidence: s.confidence,
    })),
  };
}

/** Snapshots overlapping [fromMs, toMs] ±2 s — what the model is shown for a segment. */
export function snapshotsFor(timeline: Timeline, fromMs: number, toMs: number) {
  return timeline.snapshots.filter((s) => s.t >= fromMs - WINDOW_MS && s.t <= toMs + WINDOW_MS);
}
