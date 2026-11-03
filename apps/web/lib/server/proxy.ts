import 'server-only';
import { lookup } from 'node:dns/promises';
import { checkUrl, signProxyToken, type UrlCheck } from '@ft/shared';
import { env } from './env';
import { proxyHost } from './adapters';

/** System resolver; returns every address so checkUrl can reject any private one. */
export async function systemResolve(host: string): Promise<string[]> {
  const r = await lookup(host, { all: true, verbatim: true });
  return r.map((a) => a.address);
}

export function fixtureAllowance() {
  return { environment: process.env.ENVIRONMENT, allowHosts: process.env.ALLOW_FIXTURE_HOSTS };
}

/** Server-side URL validation for review creation (SPEC §3.1, §7). */
export function validateSiteUrl(input: string): Promise<UrlCheck> {
  return checkUrl(input, systemResolve, fixtureAllowance());
}

export async function proxyEnterUrl(opts: {
  reviewId: string;
  siteUrl: URL;
  etld1: string;
  path?: string;
}) {
  const token = await signProxyToken(
    { rid: opts.reviewId, etld1: opts.etld1, origin: opts.siteUrl.origin },
    env().PROXY_TOKEN_SECRET,
  );
  const host = proxyHost();
  const path = opts.path ?? `${opts.siteUrl.pathname}${opts.siteUrl.search}`;
  return {
    url: host.enterUrl(opts.reviewId, token, path),
    origin: host.originFor(opts.reviewId),
    token,
  };
}

/** Dev/test harness guard: needs an explicit flag AND a localhost app origin. Never true in a real deployment. */
export function harnessEnabled(
  e: { ENABLE_TEST_HARNESS?: string; APP_ORIGIN?: string } = process.env as Record<
    string,
    string | undefined
  >,
): boolean {
  if (e.ENABLE_TEST_HARNESS !== '1' || !e.APP_ORIGIN) return false;
  try {
    const h = new URL(e.APP_ORIGIN).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}
