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

/**
 * Local whisper.cpp server (D14, M3 spike: docs/spikes/M3-whisper-word-timestamps.md).
 * Server must run with `--convert` (ffmpeg); default settings, no VAD (VAD shifts timestamps).
 */
export function localTranscriber(url: string, timeoutMs = 60_000): Transcriber {
  return {
    name: 'whisper.cpp',
    async transcribe(audio, mimeType) {
      const form = new FormData();
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.split('/')[1]!.split(';')[0]!;
      form.set(
        'file',
        new Blob([audio as Uint8Array<ArrayBuffer>], { type: mimeType }),
        `audio.${ext}`,
      );
      form.set('response_format', 'verbose_json');
      form.set('temperature', '0');
      const res = await fetch(`${url}/inference`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`whisper ${res.status}`);
      return fromWhisper((await res.json()) as WhisperVerbose);
    },
  };
}

type WhisperVerbose = {
  segments?: { words?: { word: string; start: number; end: number }[] }[];
};

/**
 * Whisper emits word pieces and punctuation as separate tokens. A token that doesn't start with a
 * space continues the previous word (" V" + "ietnam", " you" + "'re", "enough" + ".").
 */
export function fromWhisper(r: WhisperVerbose): TranscriptResult {
  const words: TranscriptResult['words'] = [];
  for (const seg of r.segments ?? []) {
    const segStart = words.length; // word pieces never continue across segments
    for (const t of seg.words ?? []) {
      const w = t.word.trim();
      if (!w || /^\[.*\]$/.test(w)) continue; // skip empties and [BLANK_AUDIO]-style markers
      const prev = words[words.length - 1];
      const piece = words.length > segStart && !/^\s/.test(t.word);
      if (prev && (piece || /^[^\p{L}\p{N}]+$/u.test(w))) {
        prev.w = (prev.w + w).slice(0, 100);
        prev.end = Math.max(prev.end, t.end);
        continue;
      }
      words.push({
        w: w.slice(0, 100),
        start: Math.max(0, t.start),
        end: Math.max(t.start, t.end),
      });
    }
  }
  return { text: words.map((w) => w.w).join(' '), words };
}
