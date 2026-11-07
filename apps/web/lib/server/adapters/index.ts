import 'server-only';
import type {
  AnchorResolver,
  Mailer,
  ProxyHost,
  ScreenshotService,
  ToneClassifier,
  Transcriber,
} from '@ft/shared';
import { aiImpl, env } from '../env';
import { localTranscriber, mockTranscriber } from './transcriber';
import { mockAnchorResolver, ollamaAnchorResolver } from './anchor-resolver';
import { mockToneClassifier, ollamaToneClassifier } from './tone';
import { localScreenshotService, mockScreenshotService } from './screenshot';
import { localMailer, mockMailer } from './mailer';
import { localProxyHost } from './proxy-host';

/** D30 registry: pick implementations by env. */

export function transcriber(): Transcriber {
  return aiImpl('TRANSCRIBER') === 'mock' ? mockTranscriber() : localTranscriber(env().WHISPER_URL);
}
export function anchorResolver(): AnchorResolver {
  return aiImpl('ANCHOR_RESOLVER') === 'mock'
    ? mockAnchorResolver()
    : ollamaAnchorResolver(env().OLLAMA_URL, env().ANCHOR_MODEL);
}
export function toneClassifier(): ToneClassifier {
  return aiImpl('TONE_CLASSIFIER') === 'mock'
    ? mockToneClassifier()
    : ollamaToneClassifier(env().OLLAMA_URL, env().ANCHOR_MODEL);
}
export function screenshotService(): ScreenshotService {
  return env().SCREENSHOT === 'mock' ? mockScreenshotService() : localScreenshotService();
}
export function mailer(): Mailer {
  return env().MAILER === 'mock' ? mockMailer() : localMailer();
}
export function proxyHost(): ProxyHost {
  return localProxyHost();
}
