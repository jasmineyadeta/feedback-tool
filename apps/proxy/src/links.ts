import { sameEtld1 } from '@ft/shared';

/** Pure helpers for mapping upstream URLs to proxy URLs (unit-tested in Node). */

export type Ctx = {
  proxyOrigin: string; // e.g. http://localhost:8787
  upstream: URL; // current upstream document URL
  etld1: string;
};

export type LinkTarget =
  { kind: 'proxied'; href: string } | { kind: 'external'; href: string } | { kind: 'keep' };

export function hostSwitchPath(host: string, pathAndQuery: string): string {
  return `/__host?h=${encodeURIComponent(host)}&p=${encodeURIComponent(pathAndQuery)}`;
}

export function classifyLink(rawHref: string, ctx: Ctx): LinkTarget {
  const href = rawHref.trim();
  if (!href || /^(mailto|tel|sms|javascript|data|blob):/i.test(href)) return { kind: 'keep' };
  let u: URL;
  try {
    u = new URL(href, ctx.upstream);
  } catch {
    return { kind: 'keep' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { kind: 'keep' };
  const pq = `${u.pathname}${u.search}`;
  if (u.host === ctx.upstream.host)
    return { kind: 'proxied', href: `${ctx.proxyOrigin}${pq}${u.hash}` };
  if (u.protocol === 'https:' && sameEtld1(u.hostname, ctx.etld1))
    return { kind: 'proxied', href: `${ctx.proxyOrigin}${hostSwitchPath(u.host, pq)}${u.hash}` };
  return { kind: 'external', href: u.toString() };
}

/** Translate an upstream redirect Location to where the browser should go. */
export function translateRedirect(
  location: string,
  ctx: Ctx,
): { kind: 'proxy'; to: string } | { kind: 'outside'; host: string } | { kind: 'invalid' } {
  let u: URL;
  try {
    u = new URL(location, ctx.upstream);
  } catch {
    return { kind: 'invalid' };
  }
  const pq = `${u.pathname}${u.search}`;
  if (u.host === ctx.upstream.host && u.protocol === ctx.upstream.protocol)
    return { kind: 'proxy', to: `${ctx.proxyOrigin}${pq}` };
  if (u.protocol === 'https:' && sameEtld1(u.hostname, ctx.etld1))
    return { kind: 'proxy', to: `${ctx.proxyOrigin}${hostSwitchPath(u.host, pq)}` };
  if (u.host === ctx.upstream.host && u.protocol === 'https:')
    return { kind: 'proxy', to: `${ctx.proxyOrigin}${pq}` }; // http->https upgrade on same host
  return { kind: 'outside', host: u.hostname };
}

const DROP_RESPONSE = [
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'set-cookie',
  'strict-transport-security',
  'content-length',
  'clear-site-data',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'report-to',
  'nel',
  'alt-svc',
  'link', // may carry preload/modulepreload with relative URLs resolved against the proxy
];

export function sanitizeResponseHeaders(
  upstream: Headers,
  allowedAppOrigins: string[],
  isDocument: boolean,
): Headers {
  const h = new Headers();
  upstream.forEach((v, k) => {
    if (!DROP_RESPONSE.includes(k.toLowerCase())) h.set(k, v);
  });
  h.set('x-robots-tag', 'noindex, nofollow');
  h.set('cache-control', 'private, no-store');
  h.set('referrer-policy', 'no-referrer');
  if (isDocument) {
    const ancestors = allowedAppOrigins.length ? allowedAppOrigins.join(' ') : "'none'";
    h.set('content-security-policy', `frame-ancestors ${ancestors}`);
  }
  return h;
}

/** Request headers we forward upstream. Never cookies or auth. */
const FORWARD = [
  'accept',
  'accept-language',
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-url',
  'x-requested-with',
  'range',
  'if-none-match',
  'if-modified-since',
];
export const PROXY_UA =
  'Mozilla/5.0 (compatible; FeedbackReviewProxy/0.1; +https://github.com/feedback-tool)';
export function upstreamRequestHeaders(req: Headers): Headers {
  const h = new Headers();
  for (const k of FORWARD) {
    const v = req.get(k);
    if (v) h.set(k, v);
  }
  h.set('user-agent', PROXY_UA);
  return h;
}

export type CookieOpts = { secure: boolean };
export function setCookie(
  name: string,
  value: string,
  o: CookieOpts,
  maxAgeSec = 6 * 3600,
): string {
  const base = `${name}=${value}; Path=/; HttpOnly; Max-Age=${maxAgeSec}`;
  // https (tunnels / Phase B): cross-site iframe needs SameSite=None; Secure; Partitioned (CHIPS).
  return o.secure ? `${base}; Secure; SameSite=None; Partitioned` : `${base}; SameSite=Lax`;
}
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
