/** Collapse runs of whitespace and trim. Used for transcript and quote comparison. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
