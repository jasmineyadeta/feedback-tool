import { getDomain } from 'tldts';

/**
 * URL safety for anything we fetch on a user's behalf (SPEC §7). Pure functions; DNS resolution is
 * injected so the same logic runs in Node (app) and workerd (proxy).
 */

export type UrlCheck =
  { ok: true; url: URL; etld1: string } | { ok: false; reason: UrlRejectReason; message: string };

export type UrlRejectReason =
  | 'invalid'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'private-ip'
  | 'local-host'
  | 'no-domain'
  | 'unresolvable';

const MESSAGES: Record<UrlRejectReason, string> = {
  invalid: "That doesn't look like a web address. Check it and try again.",
  scheme: 'Use a public https:// address.',
  credentials: "Addresses with a username or password aren't supported.",
  port: 'Use a standard web address (no custom port).',
  'private-ip': "That address points to a private network, which we can't open.",
  'local-host': "That address points to this computer or a local network, which we can't open.",
  'no-domain': 'Use a public website address with a domain name.',
  unresolvable: "We couldn't find that website. Check the address and try again.",
};
const reject = (reason: UrlRejectReason): UrlCheck => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

export type FixtureAllowance = { environment: string | undefined; allowHosts: string | undefined };

/** ALLOW_FIXTURE_HOSTS is honored solely when ENVIRONMENT=test (SPEC §8 M1). */
export function fixtureHosts(a: FixtureAllowance | undefined): Set<string> {
  if (!a || a.environment !== 'test' || !a.allowHosts) return new Set();
  return new Set(
    a.allowHosts
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseIPv4(host: string): number[] | null {
  // WHATWG URL already canonicalizes decimal/octal/hex IPv4 forms to dotted decimal.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n >= 0 && n <= 255) ? o : null;
}

export function isPrivateIPv4(ip: string): boolean {
  const o = parseIPv4(ip);
  if (!o) return false;
  const [a, b] = o as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0/24, 192.0.2/24 (TEST-NET-1)
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

function expandIPv6(ip: string): number[] | null {
  let s = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const o = parseIPv4(v4[1]!);
    if (!o) return null;
    s =
      s.slice(0, -v4[1]!.length) +
      `${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

export function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const [g0, , , , , g5, g6, g7] = g as number[];
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g5 === 0xffff || g5 === 0)) {
    // IPv4-mapped / compatible
    const v4 = `${g6! >> 8}.${g6! & 255}.${g7! >> 8}.${g7! & 255}`;
    return isPrivateIPv4(v4);
  }
  if ((g0! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0! & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g0 === 0x64 && g[1] === 0xff9b) return true; // NAT64 (could reach v4 private)
  if (g0 === 0x2002) return true; // 6to4 — may embed private v4; reject conservatively
  return false;
}

export function isPrivateIp(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

function isIpLiteral(host: string): boolean {
  return parseIPv4(host) !== null || host.startsWith('[') || host.includes(':');
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** Syntactic checks only (no DNS). */
export function checkUrlSyntax(input: string, fixtures?: FixtureAllowance): UrlCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return reject('invalid');
  }
  const host = url.hostname.toLowerCase();
  const allowed = fixtureHosts(fixtures);
  if (allowed.has(url.host.toLowerCase())) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject('scheme');
    return { ok: true, url, etld1: host };
  }
  if (url.protocol !== 'https:') return reject('scheme');
  if (url.username || url.password) return reject('credentials');
  if (url.port && url.port !== '443') return reject('port');
  if (isIpLiteral(host)) {
    return isPrivateIp(host) ? reject('private-ip') : reject('no-domain');
  }
  if (host === 'localhost' || LOCAL_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes('.'))
    return reject('local-host');
  const etld1 = getDomain(host, { allowPrivateDomains: true });
  if (!etld1) return reject('no-domain');
  url.hash = '';
  return { ok: true, url, etld1 };
}

export type Resolver = (host: string) => Promise<string[]>;

/** Full check: syntax + every resolved address must be public. */
export async function checkUrl(
  input: string,
  resolve: Resolver,
  fixtures?: FixtureAllowance,
): Promise<UrlCheck> {
  const syn = checkUrlSyntax(input, fixtures);
  if (!syn.ok) return syn;
  if (fixtureHosts(fixtures).has(syn.url.host.toLowerCase())) return syn;
  let ips: string[];
  try {
    ips = await resolve(syn.url.hostname);
  } catch {
    return reject('unresolvable');
  }
  if (ips.length === 0) return reject('unresolvable');
  if (ips.some(isPrivateIp)) return reject('private-ip');
  return syn;
}

/** DNS-over-HTTPS resolver (works in workerd and Node). */
export function dohResolver(endpoint = 'https://cloudflare-dns.com/dns-query'): Resolver {
  return async (host) => {
    const out: string[] = [];
    for (const type of ['A', 'AAAA']) {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`doh ${res.status}`);
      const j = (await res.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
    }
    return out;
  };
}

export function sameEtld1(host: string, etld1: string): boolean {
  const h = host.toLowerCase();
  return h === etld1 || h.endsWith(`.${etld1}`);
}
