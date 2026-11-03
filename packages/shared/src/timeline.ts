import { z } from 'zod';
import { Anchor, Rect } from './anchor';

/** One visible anchor candidate in a timeline snapshot (SPEC §5.1). */
export const VisibleElement = z.object({
  eid: z.string().max(40),
  tag: z.string().max(32),
  text: z.string().max(160),
  alt: z.string().max(200).nullable().default(null),
  rectViewport: Rect,
  cssPath: z.string().max(2000).default(''),
  /** Full anchor for this element, so the server can turn an AI pick into a real anchor. */
  anchor: Anchor.optional(),
});
export type VisibleElement = z.infer<typeof VisibleElement>;

export const TimelineSnapshot = z.object({
  t: z.number().nonnegative(), // ms since recording start
  pagePath: z.string().max(2048),
  scrollY: z.number().default(0),
  elements: z.array(VisibleElement).max(40),
  /** Fallback viewport anchor for this moment. */
  viewportAnchor: Anchor,
});
export type TimelineSnapshot = z.infer<typeof TimelineSnapshot>;

export const TimelineTap = z.object({
  t: z.number().nonnegative(),
  eid: z.string().max(40).nullable(),
  fullAnchor: Anchor,
});
export type TimelineTap = z.infer<typeof TimelineTap>;

export const Timeline = z.object({
  snapshots: z.array(TimelineSnapshot).max(1200),
  taps: z.array(TimelineTap).max(200),
});
export type Timeline = z.infer<typeof Timeline>;

export const TranscriptWord = z.object({
  w: z.string().max(100),
  start: z.number().nonnegative(), // seconds
  end: z.number().nonnegative(),
});
export type TranscriptWord = z.infer<typeof TranscriptWord>;
