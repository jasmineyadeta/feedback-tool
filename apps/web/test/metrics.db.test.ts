import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { adminClient, anonClient, userClient } from './helpers/supabase';

const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
const VIEWS = [
  'metrics_reviewer_funnel',
  'metrics_recordings',
  'metrics_site_render',
  'metrics_summary',
] as const;

describe('metrics views (PRD §15)', () => {
  it('computes the reviewer funnel from events and comments', async () => {
    const a = await userClient();
    const admin = adminClient();
    const { data: r } = await admin
      .from('reviews')
      .insert({ owner_id: a.userId, artifact_type: 'pdf', title: 'M' })
      .select('id')
      .single();
    const t0 = Date.now() - 600_000;
    const at = (s: number) => new Date(t0 + s * 1000).toISOString();
    const { data: invs } = await admin
      .from('reviewer_invites')
      .insert(
        (
          [
            ['submitted', at(300)],
            ['in_progress', null],
            ['not_started', null],
          ] as const
        ).map(([status, submitted_at]) => ({
          review_id: r!.id,
          token_hash: hash(),
          created_at: at(0),
          status,
          submitted_at,
        })),
      )
      .select('id');
    const [done, started] = invs!.map((i) => i.id as string);
    await admin.from('review_events').insert([
      { review_id: r!.id, invite_id: done, type: 'first_comment_saved', created_at: at(60) },
      { review_id: r!.id, invite_id: started, type: 'first_comment_saved', created_at: at(30) },
    ]);
    const c = (invite: string, extra: Record<string, unknown>) => ({
      review_id: r!.id,
      invite_id: invite,
      text: 'x',
      state: 'saved',
      transcript_original: null,
      addressed_at: null,
      general: false,
      ...extra,
    });
    await admin.from('comments').insert([
      c(done!, {}),
      c(done!, { text: 'fixed words', transcript_original: 'fix words' }),
      c(done!, { text: 'same', transcript_original: 'same', addressed_at: at(400) }),
      // Only the automatic clean-up (capital letter, spaces) — not a correction.
      c(done!, { text: 'Looks good', transcript_original: 'looks  good ' }),
      c(done!, { text: 'overall fine', general: true }),
      c(started!, { state: 'draft' }),
    ]);

    const { data: rows, error } = await admin
      .from('metrics_reviewer_funnel')
      .select('*')
      .eq('review_id', r!.id);
    expect(error).toBeNull();
    const row = rows!.find((x) => x.invite_id === done)!;
    expect(row).toMatchObject({
      status: 'submitted',
      secs_invite_to_first_comment: 60,
      secs_first_comment_to_submit: 240,
      saved_comments: 4, // the general note isn't a pinned comment
      voice_comments: 3,
      voice_comments_edited: 1,
      addressed_comments: 1,
    });
    const other = rows!.find((x) => x.invite_id === started)!;
    expect(other).toMatchObject({ saved_comments: 0, secs_first_comment_to_submit: null });
    // No free text or personal data in any metrics column.
    expect(Object.keys(row).sort()).not.toContain('reviewer_email');
    expect(JSON.stringify(rows)).not.toMatch(/fixed words|overall fine/);
  });

  it('the summary returns one row of numbers', async () => {
    const { data, error } = await adminClient().from('metrics_summary').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const s = data![0]!;
    expect(Number(s.invites_submitted)).toBeGreaterThan(0);
    for (const v of Object.values(s)) expect(v === null || !Number.isNaN(Number(v))).toBe(true);
  });

  it('owners and anonymous users cannot read the metrics', async () => {
    const a = await userClient();
    for (const v of VIEWS) {
      for (const client of [a.client, anonClient()]) {
        const { data, error } = await client.from(v).select('*').limit(1);
        expect(error, v).not.toBeNull();
        expect(data ?? []).toEqual([]);
      }
    }
  });
});
