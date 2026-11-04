import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient, userClient } from './helpers/supabase';

/** SPEC §7 token bucket (`take_token`), as used by every rate-limited route. */
const take = (key: string, capacity: number, perSeconds: number) =>
  adminClient()
    .rpc('take_token', { p_key: key, p_capacity: capacity, p_refill_seconds: perSeconds })
    .then(({ data, error }) => {
      if (error) throw error;
      return data as boolean;
    });

describe('rate limits', () => {
  it('allows exactly the capacity, then refuses', async () => {
    const key = `test:${randomUUID()}`;
    const got = [];
    for (let i = 0; i < 6; i++) got.push(await take(key, 5, 3600));
    expect(got).toEqual([true, true, true, true, true, false]);
  });

  it('holds under concurrent requests (no double spending)', async () => {
    const key = `test:${randomUUID()}`;
    const got = await Promise.all(Array.from({ length: 25 }, () => take(key, 10, 3600)));
    expect(got.filter(Boolean)).toHaveLength(10);
  });

  it('refills over time', async () => {
    const key = `test:${randomUUID()}`;
    expect(await take(key, 1, 1)).toBe(true);
    expect(await take(key, 1, 1)).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await take(key, 1, 1)).toBe(true);
  });

  it('keys are separate (one reviewer can’t use up another’s budget)', async () => {
    const a = `test:${randomUUID()}`;
    const b = `test:${randomUUID()}`;
    expect(await take(a, 1, 3600)).toBe(true);
    expect(await take(a, 1, 3600)).toBe(false);
    expect(await take(b, 1, 3600)).toBe(true);
  });

  it('signed-in users cannot call take_token to drain or reset buckets', async () => {
    const u = await userClient();
    const { error } = await u.client.rpc('take_token', {
      p_key: 'magic:1.2.3.4',
      p_capacity: 5,
      p_refill_seconds: 600,
    });
    expect(error).not.toBeNull();
  });
});
