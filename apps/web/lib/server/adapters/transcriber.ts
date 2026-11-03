import 'server-only';
import type { Transcriber, TranscriptResult } from '@ft/shared';

/**
 * Mock transcriber. If the audio bytes contain `FT-TRANSCRIPT:<json>` (e2e fake recordings),
 * that transcript is returned; otherwise a fixed sentence with synthetic word timings.
 */
export function mockTranscriber(): Transcriber {
  return {
    name: 'mock',
    async transcribe(audio) {
      const text = new TextDecoder().decode(audio.slice(0, 64 * 1024));
      const m = /FT-TRANSCRIPT:(\{.*?\})FT-END/s.exec(text);
      if (m) {
        const parsed = JSON.parse(m[1]!) as {
          fail?: boolean;
          words?: TranscriptResult['words'];
          text?: string;
        };
        if (parsed.fail) throw new Error('mock transcriber failure');
        if (parsed.words)
          return { text: parsed.words.map((w) => w.w).join(' '), words: parsed.words };
        if (parsed.text) return evenlySpaced(parsed.text);
      }
      return evenlySpaced('This is a mock transcript of the recording.');
    },
  };
}

export function evenlySpaced(text: string, startSec = 0.2, perWord = 0.4): TranscriptResult {
  const parts = text.split(/\s+/).filter(Boolean);
  return {
    text: parts.join(' '),
    words: parts.map((w, i) => ({
      w,
      start: +(startSec + i * perWord).toFixed(2),
      end: +(startSec + i * perWord + perWord * 0.9).toFixed(2),
    })),
  };
}
