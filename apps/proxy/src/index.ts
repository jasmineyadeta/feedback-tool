import {
  checkUrl,
  dohResolver,
  fingerprint,
  sameEtld1,
  verifyProxyToken,
  type ProxyTokenPayload,
} from '@ft/shared';
import {
  classifyLink,
  readCookie,
  sanitizeResponseHeaders,
  setCookie,
  translateRedirect,
  upstreamRequestHeaders,
  type Ctx,
} from './links';
import { RateLimiter } from './ratelimit';
import { errorPage } from './pages';
import { OVERLAY_JS } from './generated/overlay';

export interface Env {
  PROXY_TOKEN_SECRET: string;
  ALLOWED_APP_ORIGINS: string;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
  ALLOW_FIXTURE_HOSTS?: string;
  PUBLIC_ORIGIN?: string;
}

const TOKEN_COOKIE = '__ft_t';
const HOST_COOKIE = '__ft_h';
const HTML_CAP = 5 * 1024 * 1024;
const ASSET_CAP = 20 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

const tokenLimiter = new RateLimiter(600, 10 * 60_000);
const ipDocLimiter = new RateLimiter(120, 10 * 60_000);

// Small DNS cache so asset passthrough doesn't hit DoH on every request.
const dnsCache = new Map<string, { ips: string[]; at: number }>();
const doh = dohResolver();
async function resolve(host: string): Promise<string[]> {
  const c = dnsCache.get(host);
  if (c && Date.now() - c.at < 60_000) return c.ips;
  const ips = await doh(host);
  dnsCache.set(host, { ips, at: Date.now() });
  return ips;
}

function fixtures(env: Env) {
  return { environment: env.ENVIRONMENT, allowHosts: env.ALLOW_FIXTURE_HOSTS };
}
function appOrigins(env: Env): string[] {
  return (env.ALLOWED_APP_ORIGINS || env.APP_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function proxyOriginOf(req: Request, env: Env): string {
  return env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : new URL(req.url).origin;
}
function isSecure(req: Request, env: Env): boolean {
  return (
    proxyOriginOf(req, env).startsWith('https:') || req.headers.get('x-forwarded-proto') === 'https'
  );
}
function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return errorPage(405, 'This preview is read-only.', env.APP_ORIGIN, 'method');
    }
    if (url.pathname === '/__ping') return new Response('ok');
    if (url.pathname === '/__enter') return enter(req, env, url);
    if (url.pathname === '/__health') return health(env, url);

    const token = readCookie(req.headers.get('cookie'), TOKEN_COOKIE);
    const payload = token ? await verifyProxyToken(token, env.PROXY_TOKEN_SECRET) : null;
    if (!payload)
      return errorPage(403, 'Open this from your review link.', env.APP_ORIGIN, 'no-token');
    if (!tokenLimiter.take(token!))
      return errorPage(429, 'Too many requests. Wait a minute and reload.', env.APP_ORIGIN, 'rate');

    if (url.pathname === '/__host') return switchHost(req, env, url, payload);
    if (url.pathname === '/__overlay.js') {
      return new Response(OVERLAY_JS, {
        headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' },
      });
    }

    const hostCookie = readCookie(req.headers.get('cookie'), HOST_COOKIE);
    const tokenOrigin = new URL(payload.origin);
    let upstreamHost = tokenOrigin.host;
    if (hostCookie) {
      const h = decodeURIComponent(hostCookie);
      if (h !== upstreamHost && sameEtld1(h.split(':')[0]!, payload.etld1)) upstreamHost = h;
    }
    const upstream = new URL(
      `${url.pathname}${url.search}`,
      `${tokenOrigin.protocol}//${upstreamHost}`,
    );
    return proxyRequest(req, env, upstream, payload);
  },
} satisfies ExportedHandler<Env>;

async function enter(req: Request, env: Env, url: URL): Promise<Response> {
  const t = url.searchParams.get('t') ?? '';
  const p = url.searchParams.get('p') ?? '/';
  const payload = await verifyProxyToken(t, env.PROXY_TOKEN_SECRET);
  if (!payload)
    return errorPage(
      403,
      'This review link has expired. Reload the review page.',
      env.APP_ORIGIN,
      'bad-token',
    );
  const path = p.startsWith('/') && !p.startsWith('//') ? p : '/';
  const secure = isSecure(req, env);
  const h = new Headers({
    location: `${proxyOriginOf(req, env)}${path}`,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  h.append('set-cookie', setCookie(TOKEN_COOKIE, t, { secure }));
  h.append(
    'set-cookie',
    setCookie(HOST_COOKIE, encodeURIComponent(new URL(payload.origin).host), { secure }),
  );
  return new Response(null, { status: 302, headers: h });
}

async function switchHost(
  req: Request,
  env: Env,
  url: URL,
  payload: ProxyTokenPayload,
): Promise<Response> {
  const host = url.searchParams.get('h') ?? '';
  const p = url.searchParams.get('p') ?? '/';
  if (!sameEtld1(host.split(':')[0]!, payload.etld1)) {
    return errorPage(400, 'That page is on a different website.', env.APP_ORIGIN, 'outside');
  }
  const path = p.startsWith('/') && !p.startsWith('//') ? p : '/';
  const h = new Headers({
    location: `${proxyOriginOf(req, env)}${path}`,
    'cache-control': 'no-store',
  });
  h.append(
    'set-cookie',
    setCookie(HOST_COOKIE, encodeURIComponent(host), { secure: isSecure(req, env) }),
  );
  return new Response(null, { status: 302, headers: h });
}

/** App-signed health check: fetches the document server-side and reports what we found. */
async function health(env: Env, url: URL): Promise<Response> {
  const payload = await verifyProxyToken(url.searchParams.get('t') ?? '', env.PROXY_TOKEN_SECRET);
  if (!payload) return Response.json({ ok: false, reason: 'bad-token' }, { status: 403 });
  const target = new URL(payload.origin + (url.searchParams.get('p') ?? '/'));
  const started = Date.now();
  try {
    const chk = await checkUrl(target.toString(), resolve, fixtures(env));
    if (!chk.ok) return Response.json({ ok: false, reason: chk.reason });
    const res = await fetch(target, {
      headers: upstreamRequestHeaders(new Headers({ accept: 'text/html' })),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const report = {
      status: res.status,
      xfo: headers['x-frame-options'] ?? null,
      csp: headers['content-security-policy'] ? true : false,
      redirect: res.status >= 300 && res.status < 400 ? (headers['location'] ?? null) : null,
      ms: 0,
    };
    if (report.redirect) {
      const tr = translateRedirect(report.redirect, {
        proxyOrigin: '',
        upstream: target,
        etld1: payload.etld1,
      });
      report.ms = Date.now() - started;
      return Response.json({
        ok: tr.kind === 'proxy',
        reason: tr.kind === 'proxy' ? null : 'redirect-outside',
        ...report,
        platform: 'unknown',
      });
    }
    const type = headers['content-type'] ?? '';
    const html = await readCapped(res, HTML_CAP);
    const parseable = /html/i.test(type) && /<(html|head|body)[\s>]/i.test(html);
    report.ms = Date.now() - started;
    return Response.json({
      ok: res.ok && parseable,
      reason: !res.ok ? `status-${res.status}` : parseable ? null : 'not-html',
      ...report,
      platform: fingerprint(html, headers),
    });
  } catch (e) {
    return Response.json({
      ok: false,
      reason: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'fetch-failed',
      ms: Date.now() - started,
    });
  }
}

async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) {
      await reader.cancel();
      throw new Error('too-large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(out);
}

function capStream(body: ReadableStream<Uint8Array>, cap: number): ReadableStream<Uint8Array> {
  let n = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        n += chunk.byteLength;
        if (n > cap) ctrl.error(new Error('too-large'));
        else ctrl.enqueue(chunk);
      },
    }),
  );
}

async function proxyRequest(
  req: Request,
  env: Env,
  upstream: URL,
  payload: ProxyTokenPayload,
): Promise<Response> {
  const proxyOrigin = proxyOriginOf(req, env);
  const ctx: Ctx = { proxyOrigin, upstream, etld1: payload.etld1 };
  const isNav =
    req.headers.get('sec-fetch-dest') === 'iframe' ||
    req.headers.get('sec-fetch-dest') === 'document' ||
    (req.headers.get('accept') ?? '').includes('text/html');
  if (isNav && !ipDocLimiter.take(clientIp(req))) {
    return errorPage(429, 'Too many page loads. Wait a minute and reload.', env.APP_ORIGIN, 'rate');
  }

  const chk = await checkUrl(upstream.toString(), resolve, fixtures(env)).catch(() => null);
  if (!chk || !chk.ok)
    return errorPage(403, "This address can't be opened in the review.", env.APP_ORIGIN, 'unsafe');

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers: upstreamRequestHeaders(req.headers),
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return errorPage(
      502,
      timeout ? 'The website took too long to respond.' : "We couldn't reach the website.",
      env.APP_ORIGIN,
      timeout ? 'timeout' : 'fetch-failed',
    );
  }

  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    const tr = translateRedirect(res.headers.get('location')!, ctx);
    if (tr.kind === 'proxy') {
      return new Response(null, {
        status: 302,
        headers: { location: tr.to, 'cache-control': 'no-store' },
      });
    }
    return errorPage(
      400,
      'This page sends you to a different website, which opens outside the review.',
      env.APP_ORIGIN,
      'redirect-outside',
    );
  }

  const type = res.headers.get('content-type') ?? '';
  const isHtml = /text\/html|application\/xhtml/i.test(type);
  const headers = sanitizeResponseHeaders(res.headers, appOrigins(env), isHtml);
  if (!isHtml || !res.body || req.method === 'HEAD') {
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > ASSET_CAP)
      return errorPage(502, 'That file is too large to show.', env.APP_ORIGIN, 'too-large');
    return new Response(res.body ? capStream(res.body, ASSET_CAP) : null, {
      status: res.status,
      headers,
    });
  }
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > HTML_CAP)
    return errorPage(502, 'That page is too large to show.', env.APP_ORIGIN, 'too-large');

  const capped = new Response(capStream(res.body, HTML_CAP), { status: res.status, headers });
  return rewriteHtml(capped, ctx, env);
}

function cfgScript(ctx: Ctx, env: Env): string {
  const cfg = {
    app: appOrigins(env)[0] ?? env.APP_ORIGIN,
    proxy: ctx.proxyOrigin,
    upstreamOrigin: ctx.upstream.origin,
    etld1: ctx.etld1,
  };
  // JSON in a script: escape '<' so "</script>" can't break out.
  return `<script>window.__FT_CFG=${JSON.stringify(cfg).replace(/</g, '\\u003c')};</script>`;
}

function rewriteHtml(res: Response, ctx: Ctx, env: Env): Response {
  let injected = false;
  const inject = () =>
    `<base href="${escapeAttr(ctx.upstream.toString())}">${cfgScript(ctx, env)}<script src="${ctx.proxyOrigin}/__overlay.js"></script>`;
  return new HTMLRewriter()
    .on('head', {
      element(el) {
        if (!injected) {
          el.prepend(inject(), { html: true });
          injected = true;
        }
      },
    })
    .on('body', {
      element(el) {
        if (!injected) {
          el.prepend(inject(), { html: true });
          injected = true;
        }
      },
    })
    .on('base', { element: (el) => void el.remove() })
    .on('meta[http-equiv]', {
      element(el) {
        const v = (el.getAttribute('http-equiv') ?? '').toLowerCase();
        if (
          v === 'content-security-policy' ||
          v === 'content-security-policy-report-only' ||
          v === 'x-frame-options'
        )
          el.remove();
      },
    })
    .on('link[rel="manifest"], link[rel="serviceworker"]', { element: (el) => void el.remove() })
    .on('a[href], area[href]', {
      element(el) {
        const t = classifyLink(el.getAttribute('href') ?? '', ctx);
        if (t.kind === 'proxied') el.setAttribute('href', t.href);
        else if (t.kind === 'external') {
          el.setAttribute('href', t.href);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
          el.setAttribute('data-ft-external', '1');
        }
      },
    })
    .on('form', { element: (el) => void el.setAttribute('data-ft-blocked', '1') })
    .transform(res);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
