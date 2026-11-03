import 'server-only';
import type { AnchorResolver, Mailer, ProxyHost, ScreenshotService, Transcriber } from '@ft/shared';
import { aiImpl, env } from '../env';
import { mockTranscriber } from './transcriber';
import { mockAnchorResolver } from './anchor-resolver';
import { mockScreenshotService } from './screenshot';
import { localMailer, mockMailer } from './mailer';
import { localProxyHost } from './proxy-host';

/** D30 registry: pick implementations by env. `local` adapters are added per milestone. */
const notYet = (what: string): never => {
  throw new Error(`${what}: local adapter not built yet`);
};

export function transcriber(): Transcriber {
  return aiImpl('TRANSCRIBER') === 'mock' ? mockTranscriber() : notYet('Transcriber');
}
export function anchorResolver(): AnchorResolver {
  return aiImpl('ANCHOR_RESOLVER') === 'mock' ? mockAnchorResolver() : notYet('AnchorResolver');
}
export function screenshotService(): ScreenshotService {
  return env().SCREENSHOT === 'mock' ? mockScreenshotService() : notYet('ScreenshotService');
}
export function mailer(): Mailer {
  return env().MAILER === 'mock' ? mockMailer() : localMailer();
}
export function proxyHost(): ProxyHost {
  return localProxyHost();
}
