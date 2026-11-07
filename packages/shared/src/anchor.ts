import * as z from 'zod/mini';

const str = (max: number) => z.string().check(z.maxLength(max));
const num = () => z.number();

/** Rectangle in some coordinate space. */
export const Rect = z.object({
  x: num(),
  y: num(),
  w: num().check(z.gte(0)),
  h: num().check(z.gte(0)),
});
export type Rect = z.infer<typeof Rect>;

/** Point inside an element/page as a fraction 0..1. */
export const PctPoint = z.object({
  xPct: num().check(z.gte(0), z.lte(1)),
  yPct: num().check(z.gte(0), z.lte(1)),
});
export type PctPoint = z.infer<typeof PctPoint>;

/** W3C TextQuoteSelector, capped at 300 chars (SPEC §4.1). */
export const TextQuote = z.object({
  exact: str(300),
  prefix: z._default(str(64), ''),
  suffix: z._default(str(64), ''),
});
export type TextQuote = z.infer<typeof TextQuote>;

export const ElementDescriptor = z.object({
  tag: str(32),
  role: z._default(z.nullable(str(64)), null),
  ariaLabel: z._default(z.nullable(str(200)), null),
  imgAlt: z._default(z.nullable(str(200)), null),
  imgSrcBasename: z._default(z.nullable(str(200)), null),
  headingContext: z._default(z.nullable(str(200)), null),
});
export type ElementDescriptor = z.infer<typeof ElementDescriptor>;

const Viewport = z.object({
  w: num().check(z.gt(0)),
  h: num().check(z.gt(0)),
  dpr: z._default(num().check(z.gt(0)), 1),
});
const Scroll = z.object({ x: num(), y: num() });

/** Paths are kept short; never store query strings (may contain PII). */
export const PagePath = str(2048).check(z.startsWith('/'));

export const DomAnchor = z.object({
  kind: z.literal('dom'),
  pageUrl: str(2048),
  pagePath: PagePath,
  textQuote: z.nullable(TextQuote),
  elementDescriptor: ElementDescriptor,
  cssPath: str(2000),
  nthPath: str(2000),
  rectDoc: Rect,
  viewport: Viewport,
  scroll: Scroll,
  point: PctPoint,
});
export type DomAnchor = z.infer<typeof DomAnchor>;

export const ViewportAnchor = z.object({
  kind: z.literal('viewport'),
  pageUrl: str(2048),
  pagePath: PagePath,
  scroll: Scroll,
  viewport: Viewport,
  visibleTextSample: str(300),
  /** The element in the middle of the screen at that moment, so the owner's marker lands on the
   * same area even when their layout differs from the reviewer's. Absent on older comments. */
  focus: z.optional(DomAnchor),
});
export type ViewportAnchor = z.infer<typeof ViewportAnchor>;

export const ScreenshotAnchor = z.object({
  kind: z.literal('screenshot'),
  pagePath: PagePath,
  imageKey: str(500),
  point: PctPoint,
});
export type ScreenshotAnchor = z.infer<typeof ScreenshotAnchor>;

/** PDF anchor (SPEC §4.2). rectPdf in PDF user-space units. */
export const PdfAnchor = z.object({
  kind: z.literal('pdf'),
  page: z.int().check(z.gte(1), z.lte(30)),
  textQuote: z._default(z.nullable(TextQuote), null),
  rectPdf: Rect,
  point: PctPoint,
});
export type PdfAnchor = z.infer<typeof PdfAnchor>;

/** A viewport anchor for PDFs: just the page that was on screen. */
export const PdfPageAnchor = z.object({
  kind: z.literal('pdf-page'),
  page: z.int().check(z.gte(1), z.lte(30)),
  visibleTextSample: z._default(str(300), ''),
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

/** Owner-facing tone of a comment: red = action, green = praise, blue = note (neutral). */
export const Tone = z.enum(['action', 'praise', 'note']);
export type Tone = z.infer<typeof Tone>;
export const ToneOutput = z.object({
  items: z
    .array(z.object({ id: z.string().check(z.maxLength(64)), tone: Tone }))
    .check(z.maxLength(100)),
});

export const AnchorSource = z.enum(['tap', 'ai', 'viewport', 'manual', 'owner_moved']);
export type AnchorSource = z.infer<typeof AnchorSource>;
