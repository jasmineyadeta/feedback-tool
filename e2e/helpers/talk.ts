import { expect, type Page } from '@playwright/test';

/**
 * Talk-through e2e. Browsers in CI have no microphone, so MediaRecorder/getUserMedia are replaced in
 * the page with fakes whose "audio" is a webm header + a script for the mock transcriber
 * (`FT-TRANSCRIPT:{...}FT-END`, see apps/web/lib/server/adapters/transcriber.ts).
 */
export type Script = {
  words?: { w: string; start: number; end: number }[];
  text?: string;
  fail?: boolean;
};

export async function fakeMic(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript((deny) => {
    const w = window as unknown as { __ftScript: unknown; MediaRecorder: unknown };
    w.__ftScript = { text: 'default words for this recording' };
    // Define on the prototype: WebKit ignores assignment to the instance property.
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      configurable: true,
      value: async () => {
        if (deny) throw new DOMException('denied', 'NotAllowedError');
        return new MediaStream();
      },
    });
    class FakeRecorder {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: ((e: Event) => void) | null = null;
      static isTypeSupported(m: string) {
        return m.startsWith('audio/webm');
      }
      start() {
        this.state = 'recording';
      }
      pause() {
        this.state = 'paused';
      }
      resume() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        const marker = new TextEncoder().encode(
          `FT-TRANSCRIPT:${JSON.stringify(w.__ftScript)}FT-END`,
        );
        const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...marker]);
        this.ondataavailable?.({ data: new Blob([bytes], { type: 'audio/webm' }) });
        setTimeout(() => this.onstop?.(new Event('stop')), 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
  }, !!opts.deny);
}

export const setScript = (page: Page, s: Script) =>
  page.evaluate((x) => ((window as unknown as { __ftScript: unknown }).__ftScript = x), s);

export async function startRecording(page: Page) {
  await page.getByRole('button', { name: 'Record' }).click();
  const consent = page.getByRole('dialog', { name: 'Before you record' });
  if (await consent.isVisible().catch(() => false))
    await consent.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('status', { name: 'Recording' })).toBeVisible();
}
