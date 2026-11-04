import 'server-only';
import { adminClient } from './supabase';

export type EventType =
  | 'review_created'
  | 'invite_created'
  | 'first_comment_saved'
  | 'recording_transcribed'
  | 'ai_anchor_rejected'
  | 'submitted'
  | 'owner_viewed_feedback'
  | 'comment_addressed'
  | 'render_fallback'
  | 'comment_moved';

/** First-party analytics only (D23). `meta` must never contain content, emails, or URLs beyond eTLD+1. */
export async function logEvent(
  reviewId: string,
  inviteId: string | null,
  type: EventType,
  meta: Record<string, string | number | boolean>,
) {
  const { error } = await adminClient()
    .from('review_events')
    .insert({ review_id: reviewId, invite_id: inviteId, type, meta });
  if (error) console.error('event log failed', type, error.code);
}
