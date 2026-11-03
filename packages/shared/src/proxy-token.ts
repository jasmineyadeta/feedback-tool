/**
 * Proxy token (SPEC §6): base64url(JSON{rid, etld1, origin, exp}) + "." + base64url(HMAC-SHA256).
 * WebCrypto only, so the same code runs in Node (app) and workerd (proxy).
 * `origin` is the upstream site origin the review was created for; it must lie within `etld1`.
 */
export type ProxyTokenPayload = { rid: string; etld1: string; origin: string; exp: number };

export const PROXY_TOKEN_TTL_SEC = 6 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signProxyToken(
  p: Omit<ProxyTokenPayload, 'exp'> & { exp?: number },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: ProxyTokenPayload = { ...p, exp: p.exp ?? nowSec + PROXY_TOKEN_TTL_SEC };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)),
  );
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload if the signature is valid and unexpired, else null. Constant-time via subtle.verify. */
export async function verifyProxyToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<ProxyTokenPayload | null> {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(parts[1]);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(parts[0]));
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as ProxyTokenPayload;
    if (typeof p.rid !== 'string' || typeof p.etld1 !== 'string' || typeof p.origin !== 'string')
      return null;
    if (typeof p.exp !== 'number' || p.exp <= nowSec) return null;
    return p;
  } catch {
    return null;
  }
}
