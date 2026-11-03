/** Best-effort platform fingerprint from a document's HTML + headers (used by health check and gate). */
export type Platform =
  | 'framer'
  | 'webflow'
  | 'squarespace'
  | 'wix'
  | 'wordpress'
  | 'notion'
  | 'next'
  | 'gatsby'
  | 'react'
  | 'static'
  | 'unknown';

export function fingerprint(
  html: string,
  headers: Record<string, string | null | undefined> = {},
): Platform {
  const h = html.slice(0, 400_000);
  const gen =
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(h)?.[1]?.toLowerCase() ?? '';
  const server = `${headers['server'] ?? ''} ${headers['x-powered-by'] ?? ''}`.toLowerCase();
  if (gen.includes('framer') || h.includes('framerusercontent.com')) return 'framer';
  if (gen.includes('webflow') || /data-wf-(site|page)=/.test(h)) return 'webflow';
  if (h.includes('static1.squarespace.com') || gen.includes('squarespace')) return 'squarespace';
  if (h.includes('static.wixstatic.com') || headers['x-wix-request-id'] || gen.includes('wix'))
    return 'wix';
  if (gen.includes('wordpress') || h.includes('/wp-content/')) return 'wordpress';
  if (h.includes('notion-static.com') || gen.includes('super.so') || gen.includes('notion'))
    return 'notion';
  if (h.includes('/_next/') || h.includes('__NEXT_DATA__') || server.includes('next.js'))
    return 'next';
  if (gen.includes('gatsby') || h.includes('___gatsby')) return 'gatsby';
  if (/<div id=["'](root|app)["']><\/div>/.test(h)) return 'react';
  if (/<html/i.test(h)) return 'static';
  return 'unknown';
}
