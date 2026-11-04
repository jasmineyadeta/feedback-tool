import 'server-only';
import type { Anchor } from '@ft/shared';
import { adminClient, viaApp } from './supabase';
import { screenshotService } from './adapters';
import { proxyEnterUrl } from './proxy';
import { rateLimit } from './http';
import { logEvent } from './events';
import { enterAt } from '../artifact';
import type { ReviewerCtx } from './reviewer';

/** Per-submission and per-day caps so screenshots can't run away (SPEC §4.1 "daily budget"). */
export const MAX_SHOTS_PER_SUBMISSION = 10;
export const DAILY_SHOT_BUDGET = 300;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * One full-page screenshot per distinct (page, viewport width) used by the submission's website
 * comments, taken at the reviewer's width so the anchor's document coordinates line up.
 */
export function screenshotGroups(comments: { id: string; anchor: Anchor | null }[]) {
  const groups = new Map<
    string,
    { pagePath: string; width: number; height: number; ids: string[] }
  >();
  for (const c of comments) {
    const a = c.anchor;
    if (!a || (a.kind !== 'dom' && a.kind !== 'viewport')) continue;
    const width = clamp(a.viewport.w, 320, 1600);
    const key = `${a.pagePath}|${width}`;
    const g = groups.get(key) ?? {
      pagePath: a.pagePath,
      width,
      height: clamp(a.viewport.h, 480, 1200),
      ids: [],
    };
    g.ids.push(c.id);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Runs after submit (Next `after()`); failures only mean the owner has no fallback image. */
export async function captureSubmissionScreens(ctx: ReviewerCtx): Promise<void> {
  const r = ctx.review;
  if (r.artifact_type !== 'website' || r.render_mode !== 'live' || !r.site_url || !r.site_etld1)
    return;
  const admin = adminClient();
  const { data } = await admin
    .from('comments')
    .select('id,anchor')
    .eq('invite_id', ctx.invite.id)
    .eq('state', 'saved');
  const groups = screenshotGroups((data ?? []) as { id: string; anchor: Anchor | null }[]);
  if (!groups.length) return;
  const enter = await proxyEnterUrl({
    reviewId: r.id,
    siteUrl: new URL(r.site_url),
    etld1: r.site_etld1,
  });
  let skipped = 0;
  for (const [i, g] of groups.entries()) {
    if (
      i >= MAX_SHOTS_PER_SUBMISSION ||
      !(await rateLimit('screenshots:day', DAILY_SHOT_BUDGET, 86400))
    ) {
      skipped++;
      continue;
    }
    try {
      const png = await screenshotService().capture({
        url: enterAt(enter.url, g.pagePath),
        width: g.width,
        height: g.height,
        fullPage: true,
      });
      const key = `${r.owner_id}/${r.id}/${ctx.invite.id}/${i}-${g.width}.png`;
      const up = await admin.storage
        .from('screenshots')
        .upload(key, png, { contentType: 'image/png', upsert: true });
      if (up.error) throw up.error;
      await admin.from('comments').update({ screenshot_file_key: key }).in('id', g.ids);
    } catch {
      skipped++;
    }
  }
  if (skipped)
    await logEvent(r.id, ctx.invite.id, 'render_fallback', {
      reason: 'screenshot_skipped',
      skipped,
    });
}

/** Short-lived URLs for the owner's "page has changed" fallback. */
export async function signScreens(keys: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  if (!unique.length) return new Map();
  const { data } = await adminClient().storage.from('screenshots').createSignedUrls(unique, 3600);
  return new Map(
    (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, viaApp(d.signedUrl)]] : [])),
  );
}
