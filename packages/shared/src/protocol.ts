import * as z from 'zod/mini';
import { Anchor } from './anchor';
import { TimelineSnapshot, TimelineTap } from './timeline';

/**
 * postMessage protocol between the app shell and the overlay running inside the
 * proxied iframe. Every message carries `ft: 1` so we ignore the site's own messages.
 * Both sides MUST check event.origin before parsing (SPEC §7).
 */
const base = { ft: z.literal(1) };
const str = (max: number) => z.string().check(z.maxLength(max));

export const OverlayToShell = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('overlay:ready'),
    pagePath: str(2048),
    title: str(300),
  }),
  z.object({
    ...base,
    type: z.literal('nav'),
    pagePath: str(2048),
    title: str(300),
  }),
  z.object({ ...base, type: z.literal('timeline'), snapshot: TimelineSnapshot }),
  z.object({ ...base, type: z.literal('tap'), tap: TimelineTap }),
  /** The reviewer tapped the same thing again while recording: take that tap back. */
  z.object({ ...base, type: z.literal('tap:undo'), eid: str(40) }),
  z.object({ ...base, type: z.literal('anchor:picked'), anchor: Anchor }),
  z.object({
    ...base,
    type: z.literal('anchor:located'),
    requestId: str(64),
    found: z.boolean(),
    method: z.enum(['textQuote', 'cssPath', 'rect', 'none']),
  }),
  z.object({ ...base, type: z.literal('external-link'), host: str(253) }),
  z.object({ ...base, type: z.literal('marker:click'), label: str(8) }),
  z.object({
    ...base,
    type: z.literal('error'),
    code: str(64),
    message: str(300),
  }),
]);
export type OverlayToShell = z.infer<typeof OverlayToShell>;

export const ShellToOverlay = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('rec:start'), baseline: z.number() }),
  z.object({ ...base, type: z.literal('rec:stop') }),
  // Shell attached its listener: overlay re-announces overlay:ready (avoids a load/hydration race).
  z.object({ ...base, type: z.literal('ping') }),
  z.object({ ...base, type: z.literal('pick:start') }), // one-shot tap-to-anchor (typed comment)
  z.object({ ...base, type: z.literal('pick:cancel') }),
  z.object({
    ...base,
    type: z.literal('anchor:show'),
    requestId: str(64),
    anchor: Anchor,
    label: str(8),
  }),
  z.object({ ...base, type: z.literal('anchor:clear') }),
  z.object({
    ...base,
    type: z.literal('markers:set'),
    markers: z.array(z.object({ anchor: Anchor, label: str(8) })).check(z.maxLength(60)),
  }),
]);
export type ShellToOverlay = z.infer<typeof ShellToOverlay>;

/** Parse an untrusted message; returns null for anything that isn't ours or is malformed. */
export function parseOverlayMessage(data: unknown): OverlayToShell | null {
  const r = OverlayToShell.safeParse(data);
  return r.success ? r.data : null;
}
export function parseShellMessage(data: unknown): ShellToOverlay | null {
  const r = ShellToOverlay.safeParse(data);
  return r.success ? r.data : null;
}
