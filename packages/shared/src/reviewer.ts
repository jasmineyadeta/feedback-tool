import * as z from 'zod/mini';
import {
  Anchor,
  DomAnchor,
  PdfAnchor,
  PdfPageAnchor,
  ScreenshotAnchor,
  ViewportAnchor,
} from './anchor';
import { Timeline } from './timeline';
import { LIMITS } from './limits';

/**
 * Reviewer draft sync (SPEC §3.2 step 9). The browser keeps every comment in IndexedDB and sends
 * idempotent ops keyed by `clientId`; an op is dropped from the local queue only after the server ACKs it.
 */
export const ClientId = z.string().check(z.regex(/^[A-Za-z0-9_-]{6,64}$/));

export const GENERAL_NOTE_ID = 'general-note';

export const CommentDraft = z.object({
  clientId: ClientId,
  text: z.string().check(z.minLength(1), z.maxLength(LIMITS.commentMaxChars)),
  anchor: z.nullable(
    z.discriminatedUnion('kind', [
      PdfAnchor,
      PdfPageAnchor,
      DomAnchor,
      ViewportAnchor,
      ScreenshotAnchor,
    ]),
  ),
  general: z.boolean(),
  /** Where the anchor came from (shown to the owner as a badge). Defaults to manual. */
  source: z.optional(z.enum(['tap', 'ai', 'viewport', 'manual'])),
  sortKey: z.number().check(z.gte(-1e15), z.lte(1e15)),
});
export type CommentDraft = z.infer<typeof CommentDraft>;

export const SyncOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsert'), comment: CommentDraft }),
  z.object({ op: z.literal('delete'), clientId: ClientId }),
  /** Preview "Merge with previous": the server joins the original transcripts itself. */
  z.object({ op: z.literal('merge'), from: ClientId, into: ClientId }),
]);
export type SyncOp = z.infer<typeof SyncOp>;

export const SyncRequest = z.object({
  ops: z.array(SyncOp).check(z.minLength(1), z.maxLength(LIMITS.commentsPerSubmission + 1)),
});

export const SubmitRequest = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
  email: z.string().check(z.trim(), z.maxLength(254), z.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
});

/** Talk-through upload metadata (multipart field `meta`, JSON). Audio itself is the `audio` field. */
export const RecordingMeta = z.object({
  clientId: ClientId,
  mimeType: z.string().check(z.maxLength(100)),
  durationMs: z.int().check(z.gte(0), z.lte(LIMITS.recordingMaxMs + 5000)),
  timeline: Timeline,
});
export type RecordingMeta = z.infer<typeof RecordingMeta>;

export const CommentSource = z.enum(['tap', 'ai', 'viewport', 'manual']);
export type CommentSource = z.infer<typeof CommentSource>;

/** A comment proposed from a recording, shown in the split preview before the reviewer accepts it. */
export type ProposedComment = {
  clientId: string;
  text: string;
  transcriptOriginal: string;
  anchor: Anchor | null;
  source: CommentSource;
  startMs: number;
  endMs: number;
};

export type RecordingStatus = {
  clientId: string;
  status: 'pending' | 'ok' | 'failed';
  attempts: number;
  slow: boolean;
  proposed: ProposedComment[];
};
