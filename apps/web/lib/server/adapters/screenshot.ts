import 'server-only';
import { crc32, deflateSync } from 'node:zlib';
import type { ScreenshotService } from '@ft/shared';

const MAX_PAGE_HEIGHT = 6000;

/**
 * Phase A ScreenshotService: headless Chromium from playwright-core (browsers installed by
 * `pnpm setup`). Every URL it loads is a proxied URL, so the proxy's SSRF guard still applies.
 */
export function localScreenshotService(): ScreenshotService {
  const launch = async () => {
    const { chromium } = await import('playwright-core');
    return chromium.launch({ headless: true });
  };
  return {
    name: 'local',
    async capture({ url, width, height, scrollY = 0, fullPage = true }) {
      const browser = await launch();
      try {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
        await page.waitForTimeout(600); // let fonts/animations settle
        if (scrollY) await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        const png = await page.screenshot({
          fullPage: fullPage && total <= MAX_PAGE_HEIGHT,
          clip:
            fullPage && total > MAX_PAGE_HEIGHT
              ? { x: 0, y: 0, width, height: MAX_PAGE_HEIGHT }
              : undefined,
          type: 'png',
        });
        return new Uint8Array(png);
      } finally {
        await browser.close();
      }
    },
    async healthCheck({ url, appOrigin, timeoutMs }) {
      const started = Date.now();
      const browser = await launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        let fatalError: string | null = null;
        page.on('pageerror', () => (fatalError ??= 'script-error')); // never keep the message (site content)
        // Frame the proxied page from a real app-origin document, as the reviewer page does, and wait
        // for the overlay. (A Playwright-fulfilled page has no address, so Chromium's local-network
        // checks would block it from framing a localhost proxy.)
        await page.goto(`${new URL(appOrigin).origin}/api/health`);
        await page.evaluate((src) => {
          const w = window as { __ftReady?: boolean; __ftErr?: string };
          window.addEventListener('message', (e) => {
            const d = e.data as { ft?: number; type?: string; code?: string } | null;
            if (d?.ft !== 1) return;
            if (d.type === 'overlay:ready') w.__ftReady = true;
            if (d.type === 'error') w.__ftErr = d.code;
          });
          const f = document.createElement('iframe');
          f.src = src;
          f.style.cssText = 'width:1280px;height:800px;border:0';
          document.body.replaceChildren(f);
        }, url);
        const ready = await page
          .waitForFunction(() => (window as { __ftReady?: boolean }).__ftReady === true, null, {
            timeout: timeoutMs,
          })
          .then(() => true)
          .catch(() => false);
        const overlayErr = await page.evaluate(() => (window as { __ftErr?: string }).__ftErr);
        if (overlayErr) fatalError ??= overlayErr;
        return {
          ok: ready && !fatalError,
          overlayReady: ready,
          fatalError,
          ms: Date.now() - started,
        };
      } finally {
        await browser.close();
      }
    },
  };
}

/** Deterministic stand-in for tests: a pale "page" with grey text bars, so screenshots look like a page. */
export function mockScreenshotService(): ScreenshotService {
  return {
    name: 'mock',
    async capture({ width, height, fullPage }) {
      return fakePagePng(Math.min(width, 1600), Math.min(fullPage ? height * 2 : height, 3000));
    },
    async healthCheck({ url }) {
      const fail = url.includes('fail-health');
      return {
        ok: !fail,
        overlayReady: !fail,
        fatalError: fail ? 'script-error' : null,
        ms: 1,
      };
    },
  };
}

export function fakePagePng(w: number, h: number): Uint8Array {
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3, 0xfa); // filter byte 0 below, then RGB
    row[0] = 0;
    const band = y % 48;
    const isBar = y > 40 && band >= 16 && band < 28;
    if (isBar) {
      const end = Math.floor(w * (0.55 + 0.35 * (((y / 48) | 0) % 3) * 0.5));
      for (let x = 24; x < end; x++) row.fill(0xd4, 1 + x * 3, 4 + x * 3);
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
