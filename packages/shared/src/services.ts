import * as z from 'zod/mini';
import { Timeline, TranscriptWord } from './timeline';

/**
 * D30 service interfaces. Implementations live server-side in
 * apps/web/lib/server/adapters/{name}/{local,mock}.ts and are selected by env.
 */

export type TranscriptResult = { text: string; words: TranscriptWord[] };

export interface Transcriber {
  readonly name: string;
  /** Audio bytes in any allowlisted container; implementation normalizes. */
  transcribe(audio: Uint8Array, mimeType: string): Promise<TranscriptResult>;
}

/** What the LLM is allowed to return (SPEC §5.2 step 2). Validated with zod. */
export const ResolverSpan = z.object({
  startWord: z.int().check(z.gte(0)),
  endWord: z.int().check(z.gte(0)),
  eid: z.nullable(z.string().check(z.maxLength(40))),
  confidence: z.number().check(z.gte(0), z.lte(1)),
});
export type ResolverSpan = z.infer<typeof ResolverSpan>;
export const ResolverOutput = z.object({ spans: z.array(ResolverSpan).check(z.maxLength(200)) });
export type ResolverOutput = z.infer<typeof ResolverOutput>;

export type ResolverSegmentInput = {
  /** Global word indices covered by this segment, inclusive. */
  firstWord: number;
  lastWord: number;
  words: TranscriptWord[]; // full transcript, indexed globally
  snapshots: Timeline['snapshots']; // overlapping the segment ±2s
};

export interface AnchorResolver {
  readonly name: string;
  /** Returns raw (untrusted) model output; the caller validates it. */
  resolve(input: ResolverSegmentInput): Promise<unknown>;
}

/** Tone of each comment for the owner (action / praise / note). Raw output; the caller validates. */
export interface ToneClassifier {
  readonly name: string;
  classify(items: { id: string; text: string }[]): Promise<unknown>;
}

export interface ScreenshotService {
  readonly name: string;
  /** Full-page PNG of a (proxied) URL at a viewport width. */
  capture(opts: {
    url: string;
    width: number;
    height: number;
    scrollY?: number;
    fullPage?: boolean;
  }): Promise<Uint8Array>;
  /** Load the proxied page headlessly and wait for overlay:ready. */
  healthCheck(opts: { url: string; appOrigin: string; timeoutMs: number }): Promise<{
    ok: boolean;
    overlayReady: boolean;
    fatalError: string | null;
    ms: number;
  }>;
}

export type MailMessage = { to: string; subject: string; text: string; html?: string };
export interface Mailer {
  readonly name: string;
  send(msg: MailMessage): Promise<void>;
}

/** Builds proxy URLs for a review (Phase A: single host + __enter; Phase B: per-review subdomain). */
export interface ProxyHost {
  readonly name: string;
  /** Origin the iframe will load from, for postMessage origin checks. */
  originFor(reviewId: string): string;
  /** URL that sets the proxy cookie and redirects to `path`. */
  enterUrl(reviewId: string, token: string, path: string): string;
}
