import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { fromWhisper } from '@/lib/server/adapters/transcriber';

describe('fromWhisper', () => {
  it('trims words, attaches punctuation tokens, drops blank markers', () => {
    const r = fromWhisper({
      segments: [
        {
          words: [
            { word: ' The', start: 0, end: 0.2 },
            { word: ' summary', start: 0.5, end: 0.8 },
            { word: '.', start: 0.8, end: 0.8 },
          ],
        },
        {
          words: [
            { word: ' [BLANK_AUDIO]', start: 1, end: 2 },
            { word: ' Next', start: 3, end: 3.2 },
          ],
        },
      ],
    });
    expect(r.words.map((w) => w.w)).toEqual(['The', 'summary.', 'Next']);
    expect(r.text).toBe('The summary. Next');
    expect(r.words[2]).toEqual({ w: 'Next', start: 3, end: 3.2 });
  });
});
