/** Website health result (stored in reviews.health_report) and the plain-words explanation shown to owners. */
export type ModeReason = 'ok' | 'platform' | 'overlay-timeout' | 'script-error' | 'headless-failed';

export type SiteScreen = { width: number; key: string };

export type HealthReport = {
  checkedAt: string;
  mode: 'live' | 'screenshot';
  reason: ModeReason;
  platform: string;
  proxy: { status: number | null; ms: number };
  headless: { overlayReady: boolean; fatalError: string | null; ms: number } | null;
  /** Screenshot mode: full-page screenshots of the entry page, one per width. */
  screens: SiteScreen[];
};

const PLATFORM_NAME: Record<string, string> = {
  framer: 'Framer',
  webflow: 'Webflow',
  squarespace: 'Squarespace',
  wix: 'Wix',
  wordpress: 'WordPress',
  notion: 'Notion',
};

export function explainMode(r: Pick<HealthReport, 'mode' | 'reason' | 'platform'>): {
  title: string;
  body: string;
} {
  if (r.mode === 'live')
    return {
      title: 'Live site',
      body: 'Reviewers see your real site and can click through its pages.',
    };
  const tail =
    'so reviewers will see a screenshot of this page. They can comment on it, but can’t click through to other pages.';
  const why =
    r.reason === 'platform'
      ? `Sites built with ${PLATFORM_NAME[r.platform] ?? 'this tool'} don’t work reliably in review mode yet,`
      : r.reason === 'overlay-timeout'
        ? 'Your site didn’t finish loading in review mode within 8 seconds,'
        : r.reason === 'script-error'
          ? 'Your site showed an error when opened in review mode,'
          : 'We couldn’t confirm your site works in review mode,';
  return { title: 'Screenshot mode', body: `${why} ${tail}` };
}

/** Pick the screenshot closest to (and not narrower than, when possible) the viewer's width. */
export function pickScreen<T extends { width: number }>(
  screens: T[],
  viewportWidth: number,
): T | null {
  if (!screens.length) return null;
  const sorted = [...screens].sort((a, b) => a.width - b.width);
  return sorted.find((s) => s.width >= Math.min(viewportWidth, 1280)) ?? sorted[sorted.length - 1]!;
}
