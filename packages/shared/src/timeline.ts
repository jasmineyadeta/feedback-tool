import * as z from 'zod/mini';
import { Anchor, Rect } from './anchor';

const str = (max: number) => z.string().check(z.maxLength(max));
const nonneg = () => z.number().check(z.gte(0));

/** One visible anchor candidate in a timeline snapshot (SPEC §5.1). */
export const VisibleElement = z.object({
  eid: str(40),
  tag: str(32),
  text: str(160),
  alt: z._default(z.nullable(str(200)), null),
  rectViewport: Rect,
  cssPath: z._default(str(2000), ''),
  /** Full anchor for this element, so the server can turn an AI pick into a real anchor. */
  anchor: z.optional(Anchor),
});
export type VisibleElement = z.infer<typeof VisibleElement>;

export const TimelineSnapshot = z.object({
  t: nonneg(), // ms since recording start
  pagePath: str(2048),
  scrollY: z._default(z.number(), 0),
  elements: z.array(VisibleElement).check(z.maxLength(40)),
  /** Fallback viewport anchor for this moment. */
  viewportAnchor: Anchor,
});
export type TimelineSnapshot = z.infer<typeof TimelineSnapshot>;

export const TimelineTap = z.object({
  t: nonneg(),
  eid: z.nullable(str(40)),
  fullAnchor: Anchor,
});
export type TimelineTap = z.infer<typeof TimelineTap>;

export const Timeline = z.object({
  snapshots: z.array(TimelineSnapshot).check(z.maxLength(1200)),
  taps: z.array(TimelineTap).check(z.maxLength(200)),
});
export type Timeline = z.infer<typeof Timeline>;

export const TranscriptWord = z.object({
  w: str(100),
  start: nonneg(), // seconds
  end: nonneg(),
});
export type TranscriptWord = z.infer<typeof TranscriptWord>;
