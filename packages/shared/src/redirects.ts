import { checkUrl, type FixtureAllowance, type Resolver, type UrlCheck } from './url-safety';

/**
 * Follow up to `max` redirects for a site URL at review creation (SPEC §3.1). Every hop is
 * re-validated (https, public DNS) before it is fetched. Returns the final safe URL.
 */
export async function resolveSiteUrl(
  input: string,
  resolve: Resolver,
  opts: { fixtures?: FixtureAllowance; max?: number; userAgent?: string; timeoutMs?: number } = {},
): Promise<UrlCheck & { hops?: number }> {
  let cur = await checkUrl(input, resolve, opts.fixtures);
  for (let hop = 0; cur.ok; hop++) {
    const res = await fetch(cur.url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': opts.userAgent ?? 'Mozilla/5.0 (compatible; FeedbackReviewProxy/0.1)',
        accept: 'text/html',
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    }).catch(() => null);
    if (!res)
      return {
        ok: false,
        reason: 'unresolvable',
        message: "We couldn't reach that website. Check the address and try again.",
      };
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) return { ...cur, hops: hop };
    if (hop >= (opts.max ?? 5))
      return { ok: false, reason: 'invalid', message: 'That address redirects too many times.' };
    cur = await checkUrl(new URL(loc, cur.url).toString(), resolve, opts.fixtures);
  }
  return cur;
}
