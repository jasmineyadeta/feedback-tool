import { z } from 'zod';

/** Rectangle in some coordinate space. */
export const Rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().nonnegative(),
  h: z.number().finite().nonnegative(),
});
export type Rect = z.infer<typeof Rect>;

/** Point inside an element/page as a fraction 0..1. */
export const PctPoint = z.object({
  xPct: z.number().min(0).max(1),
  yPct: z.number().min(0).max(1),
});
export type PctPoint = z.infer<typeof PctPoint>;

/** W3C TextQuoteSelector, capped at 300 chars (SPEC §4.1). */
export const TextQuote = z.object({
  exact: z.string().max(300),
  prefix: z.string().max(64).default(''),
  suffix: z.string().max(64).default(''),
});
export type TextQuote = z.infer<typeof TextQuote>;

export const ElementDescriptor = z.object({
  tag: z.string().max(32),
  role: z.string().max(64).nullable().default(null),
  ariaLabel: z.string().max(200).nullable().default(null),
  imgAlt: z.string().max(200).nullable().default(null),
  imgSrcBasename: z.string().max(200).nullable().default(null),
  headingContext: z.string().max(200).nullable().default(null),
});
export type ElementDescriptor = z.infer<typeof ElementDescriptor>;

const Viewport = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
  dpr: z.number().positive().default(1),
});
const Scroll = z.object({ x: z.number(), y: z.number() });

/** Paths are kept short; never store query strings (may contain PII). */
export const PagePath = z.string().max(2048).startsWith('/');

export const DomAnchor = z.object({
  kind: z.literal('dom'),
  pageUrl: z.string().max(2048),
  pagePath: PagePath,
  textQuote: TextQuote.nullable(),
  elementDescriptor: ElementDescriptor,
  cssPath: z.string().max(2000),
  nthPath: z.string().max(2000),
  rectDoc: Rect,
  viewport: Viewport,
  scroll: Scroll,
  point: PctPoint,
});
export type DomAnchor = z.infer<typeof DomAnchor>;

export const ViewportAnchor = z.object({
  kind: z.literal('viewport'),
  pageUrl: z.string().max(2048),
  pagePath: PagePath,
  scroll: Scroll,
  viewport: Viewport,
  visibleTextSample: z.string().max(300),
});
export type ViewportAnchor = z.infer<typeof ViewportAnchor>;

export const ScreenshotAnchor = z.object({
  kind: z.literal('screenshot'),
  pagePath: PagePath,
  imageKey: z.string().max(500),
  point: PctPoint,
});
export type ScreenshotAnchor = z.infer<typeof ScreenshotAnchor>;

/** PDF anchor (SPEC §4.2). rectPdf in PDF user-space units. */
export const PdfAnchor = z.object({
  kind: z.literal('pdf'),
  page: z.number().int().min(1).max(30),
  textQuote: TextQuote.nullable().default(null),
  rectPdf: Rect,
  point: PctPoint,
});
export type PdfAnchor = z.infer<typeof PdfAnchor>;

/** A viewport anchor for PDFs: just the page that was on screen. */
export const PdfPageAnchor = z.object({
  kind: z.literal('pdf-page'),
  page: z.number().int().min(1).max(30),
  visibleTextSample: z.string().max(300).default(''),
});
export type PdfPageAnchor = z.infer<typeof PdfPageAnchor>;

export const Anchor = z.discriminatedUnion('kind', [
  DomAnchor,
  ViewportAnchor,
  ScreenshotAnchor,
  PdfAnchor,
  PdfPageAnchor,
]);
export type Anchor = z.infer<typeof Anchor>;

export const AnchorSource = z.enum(['tap', 'ai', 'viewport', 'manual', 'owner_moved']);
export type AnchorSource = z.infer<typeof AnchorSource>;
