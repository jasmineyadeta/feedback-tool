import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { adminClient, sbEnv, userClient } from './helpers/supabase';

vi.mock('server-only', () => ({}));
let tone: typeof import('@/lib/server/tone');
let mock: typeof import('@/lib/server/adapters/tone');

beforeAll(async () => {
  const e = sbEnv();
  Object.assign(process.env, {
    SUPABASE_URL: e.url,
    SUPABASE_ANON_KEY: e.anon,
    SUPABASE_SERVICE_ROLE_KEY: e.service,
    MOCK_AI: '1',
  });
  (await import('@/lib/server/env')).resetEnvCache();
  tone = await import('@/lib/server/tone');
  mock = await import('@/lib/server/adapters/tone');
});
const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');

describe('mock tone rule', () => {
  it('suggestions are action, positive-only is praise, the rest is a note', () => {
    expect(mock.mockTone('Really love the opening animation.')).toBe('praise');
    expect(mock.mockTone("I don't entirely know what you did here")).toBe('action');
    expect(mock.mockTone('Nice work, but the nav should be bigger')).toBe('action');
    expect(mock.mockTone('This is the about page')).toBe('note');
  });
});

describe('classifyPending', () => {
  it('labels submitted comments only, never overwrites the owner, never changes the words', async () => {
    const owner = await userClient();
    const admin = adminClient();
    const { data: r } = await admin
      .from('reviews')
      .insert({ owner_id: owner.userId, artifact_type: 'pdf', title: 'Tone' })
      .select('id')
      .single();
    const { data: invs } = await admin
      .from('reviewer_invites')
      .insert(
        (['submitted', 'in_progress'] as const).map((status) => ({
          review_id: r!.id,
          token_hash: hash(),
          status,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        })),
      )
      .select('id');
    const [done, open] = invs!.map((i) => i.id as string);
    const c = (invite: string, text: string, extra: Record<string, unknown> = {}) => ({
      review_id: r!.id,
      invite_id: invite,
      text,
      state: 'saved',
      general: false,
      ...extra,
    });
    await admin
      .from('comments')
      .insert([
        c(done!, 'I love the header'),
        c(done!, 'The nav should be bigger'),
        c(done!, 'This is the about page'),
        c(done!, 'Should be changed', { tone: 'praise', tone_source: 'owner' }),
        c(open!, 'The footer needs work'),
      ]);

    expect(await tone.classifyPending({ inviteId: done })).toBe(3);
    expect(await tone.classifyPending({ inviteId: open })).toBe(0); // not submitted yet
    const { data } = await admin
      .from('comments')
      .select('text,tone,tone_source')
      .eq('review_id', r!.id)
      .order('text');
    expect(data).toEqual([
      { text: 'I love the header', tone: 'praise', tone_source: 'ai' },
      { text: 'Should be changed', tone: 'praise', tone_source: 'owner' },
      { text: 'The footer needs work', tone: null, tone_source: null },
      { text: 'The nav should be bigger', tone: 'action', tone_source: 'ai' },
      { text: 'This is the about page', tone: 'note', tone_source: 'ai' },
    ]);

    // Owners may change the tone of their own review's comments, but not the words.
    const { data: one } = await admin
      .from('comments')
      .select('id')
      .eq('review_id', r!.id)
      .eq('text', 'I love the header')
      .single();
    const set = await owner.client
      .from('comments')
      .update({ tone: 'note', tone_source: 'owner' })
      .eq('id', one!.id)
      .select('tone');
    expect(set.data).toEqual([{ tone: 'note' }]);
    const words = await owner.client
      .from('comments')
      .update({ text: 'rewritten' })
      .eq('id', one!.id);
    expect(words.error).not.toBeNull();
    const stranger = await userClient();
    const other = await stranger.client
      .from('comments')
      .update({ tone: 'action' })
      .eq('id', one!.id)
      .select('id');
    expect(other.data).toEqual([]);
  });
});
