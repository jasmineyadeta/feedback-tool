import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Timeline, TranscriptWord } from '@ft/shared';
import { ollamaAnchorResolver } from '@/lib/server/adapters/anchor-resolver';
import { validateSpans } from '@/lib/server/validate-spans';

/** `pnpm test:live-ai` only — talks to the real local Ollama. Never part of `pnpm verify`. */
const URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.ANCHOR_MODEL ?? 'qwen3:14b';

const say = (text: string, at: number): TranscriptWord[] =>
  text.split(' ').map((w, i) => ({ w, start: at + i * 0.35, end: at + i * 0.35 + 0.3 }));

describe('ollama anchor resolver (live)', () => {
  it('returns output that passes the validator and points at the right line', async () => {
    const words = say('the experience section should lead with the analytical engines role', 0.5);
    const lines = [
      ['p1-l0', 'Ada Lovelace — Product Designer'],
      ['p1-l1', 'Summary: designer focused on research-led product work'],
      ['p1-l2', 'Experience at Analytical Engines Ltd'],
      ['p1-l3', 'Education: University of London'],
    ];
    const timeline: Timeline = {
      taps: [],
      snapshots: [0, 1000, 2000, 3000, 4000].map((t) => ({
        t,
        pagePath: '/page/1',
        scrollY: 0,
        elements: lines.map(([eid, text]) => ({
          eid: eid!,
          tag: 'pdf-line',
          text: text!,
          alt: null,
          rectViewport: { x: 0, y: 0, w: 1, h: 1 },
          cssPath: '',
        })),
        viewportAnchor: { kind: 'pdf-page' as const, page: 1, visibleTextSample: '' },
      })),
    };
    const raw = await ollamaAnchorResolver(URL, MODEL).resolve({
      firstWord: 0,
      lastWord: words.length - 1,
      words,
      snapshots: timeline.snapshots,
    });
    const v = validateSpans(raw, { first: 0, last: words.length - 1 }, words, timeline);
    expect(v.ok, JSON.stringify(raw)).toBe(true);
    if (v.ok) expect(v.spans.map((s) => s.eid)).toContain('p1-l2');
  });
});
