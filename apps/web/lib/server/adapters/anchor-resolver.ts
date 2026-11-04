import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AnchorResolver, ResolverOutput, ResolverSegmentInput } from '@ft/shared';

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

/** JSON schema for Ollama structured output (mirrors `ResolverOutput`). */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    spans: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startWord: { type: 'integer' },
          endWord: { type: 'integer' },
          eid: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: ['startWord', 'endWord', 'eid', 'confidence'],
      },
    },
  },
  required: ['spans'],
};

let promptCache: string | null = null;
export function resolverPrompt(): string {
  if (promptCache) return promptCache;
  for (const p of ['lib/anchor-resolver/prompt.md', 'apps/web/lib/anchor-resolver/prompt.md']) {
    const full = path.join(/* turbopackIgnore: true */ process.cwd(), p);
    if (existsSync(full))
      return (promptCache = readFileSync(full, 'utf8').replace(/^<!--.*?-->\s*/s, ''));
  }
  throw new Error('anchor resolver prompt not found');
}

/** Compact model input: only this segment's words and the snapshots around it. */
export function resolverMessage(input: ResolverSegmentInput): string {
  const words = input.words
    .slice(input.firstWord, input.lastWord + 1)
    .map((w, i) => [input.firstWord + i, w.w, +w.start.toFixed(1)]);
  const screen = input.snapshots
    .filter(
      (s, i, all) =>
        i === 0 ||
        JSON.stringify(s.elements.map((e) => e.eid)) !==
          JSON.stringify(all[i - 1]!.elements.map((e) => e.eid)),
    )
    .slice(0, 12)
    .map((s) => [
      +(s.t / 1000).toFixed(1),
      s.elements.slice(0, 40).map((e) => [e.eid, e.text.slice(0, 120)]),
    ]);
  return JSON.stringify({ words, screen });
}

/** Local Ollama (D15). Returns raw JSON — the caller validates it. */
export function ollamaAnchorResolver(
  url: string,
  model: string,
  timeoutMs = 60_000,
): AnchorResolver {
  return {
    name: `ollama:${model}`,
    async resolve(input) {
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: resolverPrompt() },
            { role: 'user', content: resolverMessage(input) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      const body = (await res.json()) as { message?: { content?: string } };
      return JSON.parse(body.message?.content ?? 'null') as unknown;
    },
  };
}
