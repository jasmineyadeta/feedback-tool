# M6: usage metrics views, rate limits verified, 10-reviewer load smoke

## What and why
- **Metrics views (PRD §15)**, migration `20261104000001_metrics_views.sql`:
  - `metrics_reviewer_funnel`, one row per invite:
    - status;
    - seconds from invite to first comment, and from first comment to submit;
    - saved, voice, voice-edited and addressed comment counts.
  - `metrics_recordings`: transcription outcome, attempts and upload-to-transcribed seconds.
  - `metrics_site_render`: Live vs Screenshot mode per detected platform.
  - `metrics_summary`, one row covering:
    - submit rate after starting;
    - median times;
    - comments per submitted review;
    - voice correction rate;
    - transcription success and latency;
    - AI anchors rejected;
    - render fallbacks;
    - owner open rate;
    - repeat owners and reviewers;
    - north star (submitted reviews per owner).
  - The views hold counts, rates and durations only: no comment text, transcripts, emails or URLs. Only the service role can read them; owners and anonymous users get an error.
  - A voice comment counts as "corrected" only when the reviewer changed words. The automatic capital letter and space trimming doesn't count.
  - Not measurable from data, so absent:
    - "time from opening the link" (D20: opening isn't tracked). The funnel starts at invite creation instead.
    - self-reported usefulness and changes;
    - PDF render success (it happens only in the browser);
    - business metrics.
- **`pnpm metrics`** prints the summary and the per-platform table from the local database.
- **Rate limits verified:**
  - The Postgres token bucket allows exactly its capacity, holds under 25 concurrent requests (no double spending), refills over time and keeps keys separate. Signed-in users can't call it.
  - A real route (submit) answers 429 with the plain message, per link.
- **Load smoke:** 10 reviewers in separate browsers at once. Each opens the link, types a comment, records a talk-through, accepts it and submits. No failed API calls, no page errors, every invite is Submitted, and all 20 comments are saved. It takes about 7.5 s locally.
- **Test helper fix:** `createInvite` returned the *previous* link when called twice in a row, because the old link was still on screen. It now waits for the new value. No existing test relied on the old behaviour.
- **Bug fix found by the load runs:** a rejected PDF upload could leave an empty "Bad PDF" review behind. The form showed the error first and only then asked the server to delete the review, so leaving the page (or a busy machine) skipped the delete. `owner.spec` caught this as a flaky failure on webkit-iphone. Now the server deletes a brand-new review in the same request that rejects its first upload. The form keeps a delete only for when that request never arrived, and runs it before showing the error.
- No new dependencies.

## Acceptance items
- "Rate limits verified; metrics SQL views (PRD §15)": done.
- ✅ "Load smoke: 10 concurrent simulated reviewers locally without errors": `e2e/load.spec.ts`, runs in `pnpm verify`.

## Tests
- DB tests:
  - `apps/web/test/metrics.db.test.ts`: funnel arithmetic, no text in output, summary shape, access denied to owners and anon.
  - `apps/web/test/rate-limit.db.test.ts`.
- E2E:
  - `e2e/rate-limits.spec.ts` (chromium + webkit-iphone).
  - `e2e/load.spec.ts`, chromium only, because it measures the server rather than the browser. It is marked skipped on webkit-iphone with that reason.

## Screenshots
- No UI change.

## Manual checks
- None new.

## Known limitations
- The load smoke uses the mock transcriber, as all of `pnpm verify` does. Real whisper handles one recording at a time, so 10 people recording at once on one Mac will queue: transcripts arrive later, but nothing is lost.
- `review_events` has no "autosave failed" event. Lost-comment incidents would show up as client errors, which Phase A doesn't collect.
