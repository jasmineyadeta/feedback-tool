import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { adminClient, anonClient, userClient } from './helpers/supabase';

const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');

describe('RLS policies', () => {
  it('owners only see their own reviews', async () => {
    const a = await userClient();
    const b = await userClient();
    const { data: ra, error } = await a.client
      .from('reviews')
      .insert({ owner_id: a.userId, artifact_type: 'pdf', title: 'A' })
      .select()
      .single();
    expect(error).toBeNull();
    const { data: seen } = await b.client.from('reviews').select('id').eq('id', ra!.id);
    expect(seen).toEqual([]);
    const { error: insErr } = await b.client
      .from('reviews')
      .insert({ owner_id: a.userId, artifact_type: 'pdf', title: 'spoof' });
    expect(insErr).not.toBeNull();
    const { data: upd } = await b.client
      .from('reviews')
      .update({ title: 'x' })
      .eq('id', ra!.id)
      .select();
    expect(upd).toEqual([]);
  });

  it('anon cannot read anything', async () => {
    const { data, error } = await anonClient().from('reviews').select('id');
    expect(data ?? []).toEqual([]);
    if (error) expect(error.code).toBeTruthy();
  });

  it('owner sees comments only after submit and cannot rewrite reviewer text', async () => {
    const a = await userClient();
    const admin = adminClient();
    const { data: r } = await a.client
      .from('reviews')
      .insert({ owner_id: a.userId, artifact_type: 'pdf', title: 'R' })
      .select()
      .single();
    const { data: inv } = await admin
      .from('reviewer_invites')
      .insert({ review_id: r!.id, token_hash: hash() })
      .select()
      .single();
    const { data: c } = await admin
      .from('comments')
      .insert({ invite_id: inv!.id, review_id: r!.id, text: 'reviewer words', state: 'saved' })
      .select()
      .single();

    const before = await a.client.from('comments').select('id').eq('review_id', r!.id);
    expect(before.data).toEqual([]);

    await admin.from('reviewer_invites').update({ status: 'submitted' }).eq('id', inv!.id);
    const after = await a.client.from('comments').select('id,text').eq('review_id', r!.id);
    expect(after.data).toHaveLength(1);

    const rewrite = await a.client.from('comments').update({ text: 'owner words' }).eq('id', c!.id);
    expect(rewrite.error).not.toBeNull();
    const addressed = await a.client
      .from('comments')
      .update({ addressed_at: new Date().toISOString() })
      .eq('id', c!.id)
      .select('id');
    expect(addressed.error).toBeNull();
    expect(addressed.data).toHaveLength(1);
  });

  it('rate limit table is not reachable by users', async () => {
    const a = await userClient();
    const { data } = await a.client.from('rate_limits').select('*');
    expect(data ?? []).toEqual([]);
    const { error } = await a.client.rpc('take_token', {
      p_key: 'x',
      p_capacity: 1,
      p_refill_seconds: 1,
    });
    expect(error).not.toBeNull();
  });

  it('take_token enforces capacity', async () => {
    const admin = adminClient();
    const key = `test:${hash()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { data } = await admin.rpc('take_token', {
        p_key: key,
        p_capacity: 3,
        p_refill_seconds: 3600,
      });
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});
