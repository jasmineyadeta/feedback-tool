import 'server-only';
import policy from '../platform-policy.json';
import type { HealthReport, ModeReason } from '../site-mode';
import { env } from './env';
import { screenshotService } from './adapters';

/** What the proxy's `/__health` reports (apps/proxy/src/index.ts). */
export type ProxyHealth = {
  ok: boolean;
  reason: string | null;
  status?: number;
  platform?: string;
  ms?: number;
};
export type HeadlessHealth = HealthReport['headless'];

export const HEADLESS_TIMEOUT_MS = 8000;

/** SPEC §3.1: the proxy fetches the document server-side (SSRF guard included) and checks it's HTML. */
export async function proxyHealth(token: string, path: string): Promise<ProxyHealth> {
  const u = new URL('/__health', env().PROXY_ORIGIN);
  u.searchParams.set('t', token);
  u.searchParams.set('p', path);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    return (await res.json()) as ProxyHealth;
  } catch {
    return { ok: false, reason: 'proxy-unreachable' };
  }
}

/** Plain-words reason the site can't be reviewed at all (no mode can help). */
export function proxyFailureMessage(h: ProxyHealth): string {
  const r = h.reason ?? '';
  if (r.startsWith('status-'))
    return `That page returned an error (${r.slice(7)}). Check the address and try again.`;
  switch (r) {
    case 'not-html':
      return 'That address isn’t a web page. Paste the address of the page you want reviewed.';
    case 'redirect-outside':
      return 'That address sends visitors to a different site. Paste the final address instead.';
    case 'timeout':
      return 'Your site took too long to respond. Try again in a minute.';
    case 'proxy-unreachable':
      return 'Review mode isn’t running on this computer. Start it with `pnpm dev` and try again.';
    default:
      return 'We couldn’t open that page. Check the address and try again.';
  }
}

/** Live unless the platform is known-bad (gate policy) or the headless check failed. */
export function decideMode(
  proxy: ProxyHealth,
  headless: HeadlessHealth,
  screenshotPlatforms: string[] = policy.screenshotPlatforms,
): { mode: 'live' | 'screenshot'; reason: ModeReason } {
  if (proxy.platform && screenshotPlatforms.includes(proxy.platform))
    return { mode: 'screenshot', reason: 'platform' };
  if (!headless) return { mode: 'screenshot', reason: 'headless-failed' };
  if (headless.fatalError) return { mode: 'screenshot', reason: 'script-error' };
  if (!headless.overlayReady) return { mode: 'screenshot', reason: 'overlay-timeout' };
  return { mode: 'live', reason: 'ok' };
}

export async function headlessHealth(enterUrl: string): Promise<HeadlessHealth> {
  try {
    const r = await screenshotService().healthCheck({
      url: enterUrl,
      appOrigin: env().APP_ORIGIN,
      timeoutMs: HEADLESS_TIMEOUT_MS,
    });
    return { overlayReady: r.overlayReady, fatalError: r.fatalError, ms: r.ms };
  } catch {
    return null;
  }
}

/** Screenshot widths: phone and desktop, so the reviewer sees the layout made for their screen. */
export const SCREEN_WIDTHS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
