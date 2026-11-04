import { LIMITS } from '@ft/shared';

/**
 * Thin wrapper over MediaRecorder (SPEC §8 M3): `audio/mp4` on Safari, `audio/webm` elsewhere.
 * Elapsed time excludes pauses; stops itself at the 10-minute limit.
 */
export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export type MicResult =
  { ok: true; stream: MediaStream } | { ok: false; reason: 'denied' | 'unsupported' | 'error' };

export async function requestMic(): Promise<MicResult> {
  if (!navigator.mediaDevices?.getUserMedia || pickMime() === null)
    return { ok: false, reason: 'unsupported' };
  try {
    return { ok: true, stream: await navigator.mediaDevices.getUserMedia({ audio: true }) };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    return {
      ok: false,
      reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error',
    };
  }
}

export class Recorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private limit: ReturnType<typeof setTimeout> | null = null;
  readonly mimeType: string;
  /** performance.now() at start — the shared clock for timeline timestamps. */
  baseline = 0;

  constructor(
    private stream: MediaStream,
    private onAutoStop: () => void,
  ) {
    const mime = pickMime() || undefined;
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.mimeType = this.rec.mimeType || mime || 'audio/webm';
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
  }

  start() {
    this.baseline = performance.now();
    this.startedAt = Date.now();
    this.rec.start(1000);
    this.armLimit();
  }

  private armLimit() {
    if (this.limit) clearTimeout(this.limit);
    this.limit = setTimeout(this.onAutoStop, LIMITS.recordingMaxMs - this.elapsedMs());
  }

  pause() {
    if (this.rec.state !== 'recording') return;
    this.rec.pause();
    this.pausedAt = Date.now();
    if (this.limit) clearTimeout(this.limit);
  }

  resume() {
    if (this.rec.state !== 'paused') return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
    this.rec.resume();
    this.armLimit();
  }

  get paused() {
    return this.rec.state === 'paused';
  }

  elapsedMs(): number {
    if (!this.startedAt) return 0;
    const now = this.pausedAt || Date.now();
    return Math.min(LIMITS.recordingMaxMs, now - this.startedAt - this.pausedTotal);
  }

  /** Ms on the recording's own clock (pauses excluded) for a performance.now() reading. */
  clock(): number {
    return this.elapsedMs();
  }

  stop(): Promise<Blob> {
    if (this.limit) clearTimeout(this.limit);
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        this.release();
        resolve(new Blob(this.chunks, { type: this.mimeType }));
      };
      if (this.rec.state === 'inactive') this.rec.onstop(new Event('stop'));
      else this.rec.stop();
    });
  }

  cancel() {
    if (this.limit) clearTimeout(this.limit);
    this.rec.onstop = null;
    if (this.rec.state !== 'inactive') this.rec.stop();
    this.release();
  }

  private release() {
    for (const t of this.stream.getTracks()) t.stop();
  }
}
