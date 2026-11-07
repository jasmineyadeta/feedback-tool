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

  it('joins word pieces that come without a leading space (" V" + "ietnam", " you" + "\'re")', () => {
    const tok = (word: string, start: number) => ({ word, start, end: start + 0.2 });
    const r = fromWhisper({
      segments: [
        {
          words: [
            tok(' you', 0),
            tok("'re", 0.2),
            tok(' in', 0.4),
            tok(' V', 0.6),
            tok('ietnam', 0.8),
          ],
        },
        { words: [tok('Next', 2)] }, // a new segment always starts a new word
      ],
    });
    expect(r.text).toBe("you're in Vietnam Next");
    expect(r.words[2]).toEqual({ w: 'Vietnam', start: 0.6, end: 1 });
  });
});
