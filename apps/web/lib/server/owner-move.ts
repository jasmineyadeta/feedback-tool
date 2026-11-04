import 'server-only';
import type { OwnerMoveRequest } from '@ft/shared';
import { adminClient, userClient } from './supabase';
import { isUuid, removeObjects, UserError, type ReviewRow } from './reviews';
import { anchorFits, cleanAnchor } from './reviewer';
import { logEvent } from './events';

/** Only anchors the reviewer didn't place themselves can be moved (SPEC §3.3 "auto-placed"). */
export const MOVABLE_SOURCES = ['ai', 'viewport', 'owner_moved'] as const;

type Moved = { id: string; anchor: OwnerMoveRequest['anchor']; anchor_source: 'owner_moved' };

/**
 * Owner moves an auto-placed comment to a spot they choose. The reviewer's words are never
 * touched: only anchor, anchor_source and the derived page columns change.
 */
export async function moveAnchor(
  review: ReviewRow,
  commentId: string,
  input: OwnerMoveRequest['anchor'],
): Promise<Moved | null> {
  if (!isUuid(commentId)) return null;
  if (!anchorFits(review, input))
    throw new UserError(400, 'That spot isn’t part of this review. Try again.', 'bad_anchor');
  // Read through RLS: owners only see their own submitted comments.
  const sb = await userClient();
  const { data: cur } = await sb
    .from('comments')
    .select('id,review_id,invite_id,general,anchor_source,page_path,screenshot_file_key')
    .eq('id', commentId)
    .maybeSingle();
  if (!cur || cur.review_id !== review.id) return null;
  if (cur.general || !(MOVABLE_SOURCES as readonly string[]).includes(cur.anchor_source ?? ''))
    throw new UserError(
      400,
      'Only auto-placed comments can be moved. The reviewer chose this spot.',
      'not_movable',
    );

  const anchor = cleanAnchor(review, input) as OwnerMoveRequest['anchor'];
  const pagePath = anchor.kind === 'pdf' ? null : anchor.pagePath;
  // The submit-time screenshot shows the old page; drop it if the comment moved to another page.
  const staleShot =
    cur.screenshot_file_key && pagePath !== cur.page_path
      ? (cur.screenshot_file_key as string)
      : null;
  const admin = adminClient();
  const { error } = await admin
    .from('comments')
    .update({
      anchor,
      anchor_source: 'owner_moved',
      anchor_confidence: null,
      page_path: pagePath,
      pdf_page: anchor.kind === 'pdf' ? anchor.page : null,
      ...(staleShot ? { screenshot_file_key: null } : {}),
    })
    .eq('id', commentId)
    .eq('review_id', review.id);
  if (error) throw error;
  if (staleShot) {
    const { count } = await admin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('screenshot_file_key', staleShot);
    if (!count) await removeObjects([{ bucket: 'screenshots', path: staleShot }]);
  }
  await logEvent(review.id, cur.invite_id as string, 'comment_moved', {
    from: cur.anchor_source,
  });
  return { id: commentId, anchor, anchor_source: 'owner_moved' };
}
