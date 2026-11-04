import * as z from 'zod/mini';
import { PdfAnchor } from './anchor';
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
  anchor: z.nullable(PdfAnchor),
  general: z.boolean(),
  sortKey: z.number().check(z.gte(-1e15), z.lte(1e15)),
});
export type CommentDraft = z.infer<typeof CommentDraft>;

export const SyncOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('upsert'), comment: CommentDraft }),
  z.object({ op: z.literal('delete'), clientId: ClientId }),
]);
export type SyncOp = z.infer<typeof SyncOp>;

export const SyncRequest = z.object({
  ops: z.array(SyncOp).check(z.minLength(1), z.maxLength(LIMITS.commentsPerSubmission + 1)),
});

export const SubmitRequest = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
  email: z.string().check(z.trim(), z.maxLength(254), z.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
});
