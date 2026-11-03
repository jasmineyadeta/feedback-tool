import 'server-only';
import type { ScreenshotService } from '@ft/shared';

// 1x1 transparent PNG.
const PNG_1PX = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
);

export function mockScreenshotService(): ScreenshotService {
  return {
    name: 'mock',
    async capture() {
      return PNG_1PX;
    },
    async healthCheck({ url }) {
      const fail = url.includes('fail-health');
      return { ok: !fail, overlayReady: !fail, fatalError: fail ? 'mock failure' : null, ms: 1 };
    },
  };
}
