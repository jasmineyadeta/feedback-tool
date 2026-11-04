# M3: preview re-anchor + merge; owner audio playback and original transcript

## What / why
- **Split preview** now has, per proposed comment: edit text, **Re-anchor** (the sheet steps aside, the reviewer taps the PDF, the comment becomes "Tapped" at that spot), **Merge with previous** (words joined in order; the stronger anchor wins: tap > AI > on-screen), Delete; then **Looks good**.
- **Merges are done by the server** (new sync op `merge {from, into}`): it joins the two *original transcripts* and time spans itself and deletes `from` — only for un-accepted recording drafts of the same invite, idempotent on retry. The browser never sends transcript text, so the owner's "Original transcript" can't be forged by the client. (Found by the new e2e: before this, merging dropped the second half of the original transcript.)
- **Owner feedback view**: source badge (Tapped / Auto-placed / On screen / Typed), **Original transcript** disclosure when the reviewer edited the words, **Play** for comments from a recording — plays exactly that comment's span (`span_start_ms`→`span_end_ms`) from a 1-hour signed URL (`GET /api/reviews/{id}/recordings/{recId}/audio`, owner RLS: submitted invites only). After the 90-day purge: "This recording was deleted after 90 days. The words are kept." (410). Page-level ("On screen") comments scroll to their page.
- Build: the prompt-file lookup is marked `turbopackIgnore`, removing a warning that the whole project would be traced into the server bundle.

## Acceptance covered (`e2e/talk-through.spec.ts`, chromium + webkit-iphone)
- Merge → one "Tapped" comment with both sentences; Re-anchor to page 2; edit; Looks good; submit → owner sees "Tapped · Page 2", the edited text, the full original transcript, a working audio URL (200), and the purge message after the audio is deleted.
- Completes M3 "split preview with Looks good, edit/re-anchor/merge/delete" and "owner audio playback".

## Screenshots
- `img/m3-preview-edit-{chromium,webkit-iphone}.png`, `img/m3-owner-audio-{chromium,webkit-iphone}.png`

## Dependencies
- None.

## Known limitations
- Owner dragging an auto-placed anchor (`owner_moved`, SPEC §3.3) is not built; the source badge is ready for it.
- Audio playback of real recordings (seeking within `audio/mp4` from Safari) is a manual check — automation uses a fake recorder.
