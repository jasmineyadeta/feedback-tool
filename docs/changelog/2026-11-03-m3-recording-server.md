# M3: recording pipeline (server) — upload, local transcription, tap split, retries, purge

## What / why
- **Upload** `POST /api/r/{token}/recordings` (multipart `audio` + `meta`): the server checks the declared type against the allowlist **and the file's magic bytes** (webm/mp4/wav/mpeg), size ≤ 25 MB, duration ≤ 10 min, and that every timeline anchor points at a real page of this PDF. Idempotent per `(invite, clientId)` so a re-sent upload (lost ACK) is harmless. Audio goes to the private `audio` bucket under `owner/review/invite/`.
- **Processing** (`lib/server/recordings.ts`): download → `Transcriber` → resolve → draft comments. Claimed with an optimistic lock on `attempts`, so the upload handler, the status poll and the jobs runner never double-process. Runs right after upload via Next `after()`.
- **Failure handling** (SPEC §8 M3): audio is stored before transcription, so it's never lost. Failures stay `pending` with backoff 15 s → 1 min → 5 min → 15 min → 1 h → 3 h, then `failed` (audio still kept). The status endpoint reports `slow` after a failed attempt or 60 s, for the "taking longer than usual" message, and kicks off due retries while the reviewer waits.
- **Local Transcriber** (`localTranscriber`): `whisper-server --convert`, `verbose_json`, per the spike. Punctuation tokens are attached to the previous word; `[BLANK_AUDIO]` markers dropped. `pnpm dev` now starts whisper with `--convert`.
- **Resolution, deterministic part** (`lib/server/resolve.ts`, SPEC §5.2 steps 1, 4, 5, 6): tap split (first word with start ≥ tap − 0.3 s; latest tap wins), viewport fallback (snapshot nearest the span midpoint), merge segments < 3 words (a tap survives the merge), whitespace + first-capital cleanup only. The AI pass slots in next.
- **Drafts**: proposals are `draft` comments, hidden from the reviewer's list and the owner until accepted; submit is blocked while drafts exist. If the reviewer already submitted (slow transcription), proposals are saved directly so nothing is lost.
- `CommentDraft` now accepts page-level anchors (`pdf-page`) and an optional `source` (tap / ai / viewport / manual) for the owner's badge.
- **Consent** `POST /api/r/{token}/consent` records `audio_consent_at`.
- **Jobs** `pnpm jobs:run` (hourly in `pnpm dev`): retries due recordings and **purges audio past `delete_audio_after` (90 days)**; failed deletions go to `storage_deletions`.

## Acceptance covered
- ✅ Purge job deletes expired audio (`recordings.db.test.ts`).
- Transcription failure → retry with backoff, audio not lost (`recordings.db.test.ts`); the reviewer-facing message and typed fallback land with the recorder UI.
- Tap split + "tap overrides AI" groundwork (`resolve.test.ts`, 10 cases).

## Dependencies
- None.

## Known limitations
- No recorder UI yet (next slice). No AI pass yet (after that).
- Retries while nobody is on the page happen hourly (jobs loop), or on the next status poll.

## Test fix: the "revoked link sometimes loads" flake (from M2)
- Cause: the test waited for `getByText('Revoked')`, a loose (case-insensitive, substring) match. The invite row's buttons "Revoke" + "Delete" read as "RevokeDelete", which contains "revoked", so the test moved on **before the revoke request had even started** (confirmed with timestamped server/test logs). The app was correct: every request after the revoke returned 404.
- Fix: `{ exact: true }` in `reviewer.spec.ts` and `owner.spec.ts` (a stricter assertion). 60/60 repeated runs green on chromium + webkit-iphone.
