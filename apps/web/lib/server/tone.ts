import 'server-only';
import { ToneOutput } from '@ft/shared';
import { adminClient } from './supabase';
import { toneClassifier } from './adapters';

const BATCH = 20;

/**
 * Label submitted comments that have no tone yet (after submit, and hourly as a retry). Only the
 * `tone` column is written; the reviewer's words are never touched. Output is validated and any id
 * not in the batch is ignored. Failures leave the tone empty for the next run; logs carry no content.
 */
export async function classifyPending(opts: { inviteId?: string; limit?: number } = {}) {
  const admin = adminClient();
  let q = admin
    .from('comments')
    .select('id,text,reviewer_invites!inner(status)')
    .is('tone', null)
    .eq('state', 'saved')
    .eq('reviewer_invites.status', 'submitted')
    .order('created_at', { ascending: false }) // newest first
    .limit(opts.limit ?? 200);
  if (opts.inviteId) q = q.eq('invite_id', opts.inviteId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).filter((r) => (r.text as string)?.trim());
  let labelled = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows
      .slice(i, i + BATCH)
      .map((r) => ({ id: r.id as string, text: r.text as string }));
    const ids = new Set(batch.map((b) => b.id));
    let out;
    try {
      out = ToneOutput.safeParse(await toneClassifier().classify(batch));
    } catch {
      console.warn('tone: classifier unavailable');
      return labelled;
    }
    if (!out.success) {
      console.warn('tone: invalid classifier output');
      continue;
    }
    for (const item of out.data.items) {
      if (!ids.has(item.id)) continue;
      ids.delete(item.id); // each comment once
      const { error: e } = await admin
        .from('comments')
        .update({ tone: item.tone, tone_source: 'ai' })
        .eq('id', item.id)
        .is('tone', null); // never overwrite the owner's choice
      if (!e) labelled++;
    }
  }
  return labelled;
}
