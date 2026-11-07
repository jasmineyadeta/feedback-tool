import { snapshotsFor, validateSpans } from './validate-spans';
import type {
  AnchorResolver,
  Anchor,
  CommentSource,
  ProposedComment,
  Timeline,
  TimelineSnapshot,
  TimelineTap,
  TranscriptWord,
} from '@ft/shared';

/**
 * Turning a transcript into comments (SPEC §5.2). Pure functions — no I/O — so they're easy to test.
 * Slice order: tap split (deterministic) → AI pass on untapped segments → split what's still
 * unanchored where the view moved → viewport fallback → merge short segments → text cleanup
 * (no rewording).
 */
export type Segment = {
  from: number; // word index, inclusive
  to: number; // word index, exclusive
  tap: TimelineTap | null;
  anchor: Anchor | null;
  source: CommentSource;
};

const TAP_LEAD_S = 0.3;
const MIN_WORDS = 3;

/** Step 1: each tap starts a new segment at the first word whose start ≥ t − 0.3 s. */
export function tapSplit(words: TranscriptWord[], taps: TimelineTap[]): Segment[] {
  if (!words.length) return [];
  const bounds = new Map<number, TimelineTap>(); // word index → tap (latest tap wins)
  for (const tap of [...taps].sort((a, b) => a.t - b.t)) {
    const at = words.findIndex((w) => w.start >= tap.t / 1000 - TAP_LEAD_S);
    if (at >= 0) bounds.set(at, tap);
  }
  const starts = [...new Set([0, ...bounds.keys()])].sort((a, b) => a - b);
  return starts.map((from, i) => {
    const tap = bounds.get(from) ?? null;
    return {
      from,
      to: starts[i + 1] ?? words.length,
      tap,
      anchor: tap ? tap.fullAnchor : null,
      source: tap ? 'tap' : 'viewport',
    };
  });
}

/** Snapshot whose time is closest to `ms`. */
export function nearestSnapshot(timeline: Timeline, ms: number): TimelineSnapshot | null {
  let best: TimelineSnapshot | null = null;
  for (const s of timeline.snapshots)
    if (!best || Math.abs(s.t - ms) < Math.abs(best.t - ms)) best = s;
  return best;
}

export function midMs(words: TranscriptWord[], seg: Segment): number {
  const a = words[seg.from]!;
  const b = words[seg.to - 1]!;
  return ((a.start + b.end) / 2) * 1000;
}

/** Where the reviewer was looking at time `ms`: page, PDF page and scroll position. */
function viewAt(timeline: Timeline, ms: number) {
  const s = nearestSnapshot(timeline, ms);
  if (!s) return null;
  const a = s.viewportAnchor;
  return {
    path: s.pagePath,
    page: a.kind === 'pdf-page' || a.kind === 'pdf' ? a.page : 0,
    y: s.scrollY,
    h: a.kind === 'viewport' ? a.viewport.h : 700,
  };
}

const MOVE_FRACTION = 0.5; // scrolled at least half a screen
const PAUSE_S = 0.4;
const WINDOW_S = { before: 3, after: 4 }; // where to look for a good break around a view change
const VIEW_MIN_WORDS = 8; // a scroll-based piece is at least a short sentence
const FILLER = /^(um+|uh+|erm|hmm+)[.,!?]*$/i;

/** How good a place it is to start a new comment before word i (0 = not a break). */
function breakScore(words: TranscriptWord[], i: number): number {
  const prev = words[i - 1]!;
  const gap = words[i]!.start - prev.end;
  const sentence = /[.!?]$/.test(prev.w);
  const filler = FILLER.test(prev.w);
  if (!sentence && !filler && gap < PAUSE_S) return 0;
  return (sentence ? 3 : 0) + (filler ? 2 : 0) + Math.min(gap, 1.5);
}

/**
 * Step 3b: a stretch of talk with no tap and no AI element is split where the view changed
 * (another page, another PDF page, or scrolled ≥ half a screen), so each piece lands where the
 * reviewer was looking. The cut goes at the best natural break near the change: end of a
 * sentence, after an "um", or the longest pause.
 */
export function viewSplit(words: TranscriptWord[], segs: Segment[], timeline: Timeline): Segment[] {
  const out: Segment[] = [];
  for (const seg of segs) {
    if (seg.anchor || seg.tap) {
      out.push(seg);
      continue;
    }
    let start = seg.from;
    let base = viewAt(timeline, words[start]!.start * 1000);
    for (let i = seg.from + 1; i < seg.to; i++) {
      const now = viewAt(timeline, words[i]!.start * 1000);
      if (!base || !now) continue;
      const moved =
        now.path !== base.path ||
        now.page !== base.page ||
        Math.abs(now.y - base.y) >= MOVE_FRACTION * base.h;
      if (!moved) continue;
      const t = words[i]!.start;
      let best = -1;
      let bestScore = 0;
      for (let j = start + VIEW_MIN_WORDS; j <= seg.to - VIEW_MIN_WORDS; j++) {
        if (words[j]!.start < t - WINDOW_S.before) continue;
        if (words[j]!.start > t + WINDOW_S.after) break;
        const score = breakScore(words, j);
        if (score > bestScore) [best, bestScore] = [j, score];
      }
      if (best < 0) continue; // no natural break nearby yet; try again at the next word
      out.push({ ...seg, from: start, to: best });
      start = best;
      base = viewAt(timeline, words[best]!.start * 1000);
      i = best;
    }
    out.push({ ...seg, from: start, to: seg.to });
  }
  return out;
}

/** Step 4: anything still without an anchor gets the viewport anchor nearest its midpoint. */
export function fillViewport(words: TranscriptWord[], segs: Segment[], timeline: Timeline) {
  return segs.map((s) =>
    s.anchor
      ? s
      : {
          ...s,
          anchor: nearestSnapshot(timeline, midMs(words, s))?.viewportAnchor ?? null,
          source: 'viewport' as const,
        },
  );
}

/**
 * Step 5: segments shorter than 3 words merge into the previous one (the first merges forward).
 * A tapped segment keeps its tap when merged into an untapped one — taps are the reviewer's intent.
 */
export function mergeShort(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && (s.to - s.from < MIN_WORDS || prev.to - prev.from < MIN_WORDS)) {
      const keep = !prev.tap && s.tap ? s : prev;
      out[out.length - 1] = { ...keep, from: prev.from, to: s.to };
    } else out.push(s);
  }
  return out;
}

/** Step 6: whitespace and first-letter capitalisation only — never rewording. */
export function cleanText(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

export function spanText(words: TranscriptWord[], seg: Segment): string {
  return words
    .slice(seg.from, seg.to)
    .map((w) => w.w)
    .join(' ');
}

export function toProposed(
  recordingClientId: string,
  words: TranscriptWord[],
  segs: Segment[],
): ProposedComment[] {
  return segs.map((s, i) => {
    const original = spanText(words, s);
    return {
      clientId: `${recordingClientId}-${i}`,
      text: cleanText(original),
      transcriptOriginal: original,
      anchor: s.anchor,
      source: s.source,
      startMs: Math.round(words[s.from]!.start * 1000),
      endMs: Math.round(words[s.to - 1]!.end * 1000),
    };
  });
}

/** Deterministic pipeline (no AI). The AI pass plugs in between tapSplit and fillViewport. */
export function resolveDeterministic(
  recordingClientId: string,
  words: TranscriptWord[],
  timeline: Timeline,
): ProposedComment[] {
  const split = viewSplit(words, tapSplit(words, timeline.taps), timeline);
  const segs = fillViewport(words, split, timeline);
  return toProposed(recordingClientId, words, mergeShort(segs));
}

// ---------------------------------------------------------------- AI pass (SPEC §5.2 steps 2–4)
const MIN_CONFIDENCE = 0.6;

export type AiStats = { asked: number; rejected: string[] };

/**
 * Taps first (never re-anchored); the AI only sees untapped segments; its output must pass the
 * validator or it's discarded for that segment. Low confidence / no eid → viewport anchor.
 * Resolver errors (LLM down/slow) propagate so the caller can retry — unless `fallbackOnError`.
 */
export async function resolveWithAI(
  recordingClientId: string,
  words: TranscriptWord[],
  timeline: Timeline,
  resolver: AnchorResolver,
  opts: { fallbackOnError?: boolean } = {},
): Promise<{ proposed: ProposedComment[]; stats: AiStats }> {
  const stats: AiStats = { asked: 0, rejected: [] };
  const out: Segment[] = [];
  for (const seg of tapSplit(words, timeline.taps)) {
    if (seg.tap) {
      out.push(seg); // Tap overrides AI: never sent to the model.
      continue;
    }
    const first = seg.from;
    const last = seg.to - 1;
    let raw: unknown;
    try {
      stats.asked++;
      raw = await resolver.resolve({
        firstWord: first,
        lastWord: last,
        words,
        snapshots: snapshotsFor(timeline, words[first]!.start * 1000, words[last]!.end * 1000),
      });
    } catch (e) {
      if (!opts.fallbackOnError) throw e;
      stats.rejected.push('resolver_error');
      out.push(seg);
      continue;
    }
    const v = validateSpans(raw, { first, last }, words, timeline);
    if (!v.ok) {
      stats.rejected.push(v.reason);
      out.push(seg); // viewport fallback below
      continue;
    }
    for (const s of v.spans) {
      const el =
        s.eid && s.confidence >= MIN_CONFIDENCE ? elementAnchor(timeline, s.eid, words, s) : null;
      out.push({
        from: s.from,
        to: s.to,
        tap: null,
        anchor: el,
        source: el ? 'ai' : 'viewport',
      });
    }
  }
  const segs = fillViewport(words, viewSplit(words, out, timeline), timeline);
  return { proposed: toProposed(recordingClientId, words, mergeShort(segs)), stats };
}

/** The element's stored anchor from the snapshot nearest the span's midpoint that contains it. */
function elementAnchor(
  timeline: Timeline,
  eid: string,
  words: TranscriptWord[],
  s: { from: number; to: number },
): Anchor | null {
  const mid = ((words[s.from]!.start + words[s.to - 1]!.end) / 2) * 1000;
  let best: { d: number; a: Anchor } | null = null;
  for (const snap of timeline.snapshots) {
    const el = snap.elements.find((e) => e.eid === eid);
    if (!el?.anchor) continue;
    const d = Math.abs(snap.t - mid);
    if (!best || d < best.d) best = { d, a: el.anchor };
  }
  return best?.a ?? null;
}
