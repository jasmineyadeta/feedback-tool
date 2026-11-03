import 'server-only';
import type { AnchorResolver, ResolverOutput } from '@ft/shared';

/**
 * Mock resolver: deterministic word-overlap heuristic. Returns one span covering the segment,
 * anchored to the visible element sharing the most words with it.
 */
export function mockAnchorResolver(): AnchorResolver {
  return {
    name: 'mock',
    async resolve({ firstWord, lastWord, words, snapshots }): Promise<ResolverOutput> {
      const segWords = new Set(
        words
          .slice(firstWord, lastWord + 1)
          .map((w) => w.w.toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter((w) => w.length > 3),
      );
      let best: { eid: string; score: number } | null = null;
      for (const s of snapshots) {
        for (const el of s.elements) {
          const elWords = `${el.text} ${el.alt ?? ''}`
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 3);
          const score = elWords.filter((w) => segWords.has(w)).length;
          if (score > 0 && (!best || score > best.score)) best = { eid: el.eid, score };
        }
      }
      return {
        spans: [
          {
            startWord: firstWord,
            endWord: lastWord,
            eid: best?.eid ?? null,
            confidence: best ? Math.min(0.95, 0.5 + best.score * 0.15) : 0.2,
          },
        ],
      };
    },
  };
}
