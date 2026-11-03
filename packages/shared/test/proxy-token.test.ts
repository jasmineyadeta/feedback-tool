import { describe, expect, it } from 'vitest';
import { signProxyToken, verifyProxyToken } from '../src';

const S = 'test-secret-0123456789';
const base = { rid: 'r1', etld1: 'foo.com', origin: 'https://www.foo.com' };

describe('proxy token', () => {
  it('round-trips', async () => {
    const t = await signProxyToken(base, S, 1000);
    const p = await verifyProxyToken(t, S, 1001);
    expect(p).toMatchObject(base);
  });
  it('rejects expired, wrong secret, tampered and junk', async () => {
    const t = await signProxyToken({ ...base, exp: 2000 }, S);
    expect(await verifyProxyToken(t, S, 2000)).toBeNull();
    expect(await verifyProxyToken(t, 'other-secret-0123456', 10)).toBeNull();
    const [body, sig] = t.split('.');
    const forged = btoa(JSON.stringify({ ...base, etld1: 'evil.com', exp: 9e9 })).replace(
      /=+$/,
      '',
    );
    expect(await verifyProxyToken(`${forged}.${sig}`, S, 10)).toBeNull();
    expect(await verifyProxyToken(`${body}.`, S, 10)).toBeNull();
    expect(await verifyProxyToken('garbage', S, 10)).toBeNull();
    expect(await verifyProxyToken('a.b.c', S, 10)).toBeNull();
  });
});
