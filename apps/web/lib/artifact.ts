import type { Anchor } from '@ft/shared';

/** What the reviewer's viewer loads (built server-side in lib/server/reviewer.ts). */
export type ReviewerArtifact =
  | { kind: 'pdf'; url: string; pageCount: number }
  | { kind: 'site'; enterUrl: string; proxyOrigin: string; startPath: string };

/** Short "where" label for a comment's anchor, shown in comment lists. */
export function anchorLabel(a: Anchor | null | undefined): string {
  if (!a) return 'General';
  switch (a.kind) {
    case 'pdf':
    case 'pdf-page':
      return `Page ${a.page}`;
    case 'dom':
    case 'viewport':
      return a.pagePath === '/' ? 'Home page' : a.pagePath;
    case 'screenshot':
      return 'Screenshot';
  }
}

/** The quoted text an anchor points at, if any. */
export function quoteOf(a: Anchor | null | undefined): string | null {
  if (a?.kind === 'pdf' || a?.kind === 'dom') return a.textQuote?.exact || null;
  return null;
}

/** Same entry URL, different starting path (the token in it is unchanged). */
export function enterAt(enterUrl: string, path: string): string {
  const u = new URL(enterUrl);
  u.searchParams.set('p', path.startsWith('/') ? path : '/');
  return u.toString();
}
