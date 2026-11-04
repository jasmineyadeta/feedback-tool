# M3: talk-through recorder — consent, recording bar, device buffer, split preview

## What / why
- **Record** button (reviewer page, desktop header + phone action bar). First time: a short disclosure sheet (recorded; turned into text *on this computer*; owner can listen for 90 days, then deleted; never used for training) → **Start recording** → consent stored server-side (`audio_consent_at`) and remembered on the device.
- **Mic**: `audio/mp4` on Safari, `audio/webm` elsewhere (`lib/client/recorder.ts`). Blocked/unsupported mic → plain message + **Type a comment** (enters tap-to-comment mode).
- **Recording bar**: red dot, elapsed time (pauses excluded), Pause/Resume, Stop, Cancel; stops itself at 10 minutes. While recording, taps on the PDF are captured (numbered "Tap n" markers), not turned into typed comments.
- **Timeline** (`lib/client/pdf-timeline.ts`, SPEC §5.3): every second and at scroll-end — visible pages and text lines (pdf.js spans grouped into lines), each with a full quote anchor and `eid = p{page}-l{line}`, plus a page-level viewport anchor. Max 40 elements/snapshot.
- **No silent loss**: on Stop the audio (as raw bytes — Safari can't keep Blobs in IndexedDB in private browsing) and metadata go to IndexedDB *before* upload, plus an in-memory copy; removed only after the server ACKs. Re-sent on load, on `online`, and every 15 s.
- **Status**: polls the server; "Turning your recording into comments…"; after a failed attempt or 60 s: "Your recording is saved — transcription is taking longer than usual. You can keep going or type."; on give-up: audio kept + typed path.
- **Split preview** ("Here's what we heard"): one card per proposed comment with source badge (Tapped / Auto-placed / On screen), page, editable text, Delete; **Looks good** turns them into saved comments through the normal sync queue (discarded ones are deleted server-side). Survives reload (open recordings are re-polled; already-accepted ones aren't shown twice).
- Coach mark now uses the SPEC copy: "Hit record and talk. Tap things to point at them. That's it."

## Acceptance covered (`e2e/talk-through.spec.ts`, chromium + webkit-iphone)
- Record → tap → Stop → preview with an *On screen* and a *Tapped* comment split exactly at the tap → Looks good → saved with `anchor_source` and `transcript_original`; consent recorded; no preview after reload.
- ✅ Permission denied → typed path offered.
- ✅ Transcription failure → audio stored, `pending` with attempts ≥ 1, "taking longer" message, typed path.
- Offline at Stop → recording is in IndexedDB (asserted), uploads on reconnect, removed from IndexedDB after ACK.
- The e2e replaces `MediaRecorder`/`getUserMedia` in the page (no mic in automation); the fake "audio" carries a script for the mock transcriber. Real-device recording is a manual check.

## Screenshots
- `img/m3-recording-{chromium,webkit-iphone}.png`, `img/m3-split-preview-{chromium,webkit-iphone}.png`

## Dependencies
- None.

## Known limitations
- Preview edit is text + delete; re-anchor and merge come with the AI slice.
- No AI placement yet: untapped speech gets the page that was on screen ("On screen").
