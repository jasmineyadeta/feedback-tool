import { describe, expect, it } from 'vitest';
import {
  classifyLink,
  readCookie,
  sanitizeResponseHeaders,
  setCookie,
  translateRedirect,
  upstreamRequestHeaders,
  type Ctx,
} from '../src/links';
import { RateLimiter } from '../src/ratelimit';

const ctx: Ctx = {
  proxyOrigin: 'http://p',
  upstream: new URL('https://www.foo.com/work/a?x=1'),
  etld1: 'foo.com',
};

describe('classifyLink', () => {
  it('proxies same-host links preserving path, query, hash', () => {
    expect(classifyLink('/about?y=2#h', ctx)).toEqual({
      kind: 'proxied',
      href: 'http://p/about?y=2#h',
    });
    expect(classifyLink('b', ctx)).toEqual({ kind: 'proxied', href: 'http://p/work/b' });
    expect(classifyLink('#top', ctx)).toEqual({ kind: 'proxied', href: 'http://p/work/a?x=1#top' });
  });
  it('routes same-eTLD+1 hosts through the host switch', () => {
    const r = classifyLink('https://blog.foo.com/post', ctx);
    expect(r.kind).toBe('proxied');
    if (r.kind === 'proxied') expect(r.href).toBe('http://p/__host?h=blog.foo.com&p=%2Fpost');
  });
  it('marks other sites external and leaves special schemes alone', () => {
    expect(classifyLink('https://evilfoo.com/', ctx).kind).toBe('external');
    expect(classifyLink('mailto:a@b.c', ctx).kind).toBe('keep');
    expect(classifyLink('javascript:alert(1)', ctx).kind).toBe('keep');
  });
});

describe('translateRedirect', () => {
  it('keeps same-host and same-site redirects inside the proxy', () => {
    expect(translateRedirect('/new', ctx)).toEqual({ kind: 'proxy', to: 'http://p/new' });
    expect(translateRedirect('https://foo.com/x', ctx).kind).toBe('proxy');
  });
  it('refuses redirects to other sites and to plain http on another host', () => {
    expect(translateRedirect('https://example.org/', ctx)).toEqual({
      kind: 'outside',
      host: 'example.org',
    });
    expect(translateRedirect('http://blog.foo.com/', ctx).kind).toBe('outside');
  });
});

describe('headers', () => {
  it('strips framing, cookies, HSTS, CSP; adds privacy headers and frame-ancestors', () => {
    const up = new Headers({
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
      'set-cookie': 'a=1',
      'strict-transport-security': 'max-age=1',
      'content-type': 'text/html',
    });
    const h = sanitizeResponseHeaders(up, ['http://app'], true);
    expect(h.get('x-frame-options')).toBeNull();
    expect(h.get('set-cookie')).toBeNull();
    expect(h.get('strict-transport-security')).toBeNull();
    expect(h.get('content-security-policy')).toBe('frame-ancestors http://app');
    expect(h.get('x-robots-tag')).toContain('noindex');
    expect(h.get('cache-control')).toBe('private, no-store');
    expect(h.get('referrer-policy')).toBe('no-referrer');
  });
  it('never forwards cookies or auth upstream', () => {
    const h = upstreamRequestHeaders(
      new Headers({ cookie: 'x=1', authorization: 'Bearer t', accept: 'text/html' }),
    );
    expect(h.get('cookie')).toBeNull();
    expect(h.get('authorization')).toBeNull();
    expect(h.get('accept')).toBe('text/html');
    expect(h.get('user-agent')).toContain('FeedbackReviewProxy');
  });
});

describe('cookies', () => {
  it('uses SameSite=None; Secure; Partitioned on https and Lax on http', () => {
    expect(setCookie('n', 'v', { secure: true })).toMatch(
      /HttpOnly.*Secure; SameSite=None; Partitioned/,
    );
    expect(setCookie('n', 'v', { secure: false })).toMatch(/SameSite=Lax/);
    expect(readCookie('a=1; __ft_t=abc.def; b=2', '__ft_t')).toBe('abc.def');
    expect(readCookie(null, 'x')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows max per window then blocks, and recovers', () => {
    const r = new RateLimiter(2, 1000);
    expect([r.take('k', 0), r.take('k', 1), r.take('k', 2)]).toEqual([true, true, false]);
    expect(r.take('k', 1500)).toBe(true);
  });
});
