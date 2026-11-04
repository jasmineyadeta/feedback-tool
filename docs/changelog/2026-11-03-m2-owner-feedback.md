# M2: owner feedback view — navigate to anchor, filter, mark addressed

## What / why
- **`/reviews/{id}/feedback`** (SPEC §3.3): PDF on the left with numbered markers, comments on the right (desktop); PDF with a bottom sheet (mobile). Each comment shows the reviewer's name marked "(self-reported)", page, quoted text for selection anchors, and the reviewer's words unchanged. General notes are listed separately.
- **Navigate to anchor**: clicking a comment scrolls the viewer to its marker (markers exist on every page before it renders) and pulses it; tapping a marker opens the list at that comment. The page indicator now follows the page under the middle of the view (it was stuck when no page was ≥50% visible).
- **Filter by reviewer** (shown when there's more than one).
- **Mark addressed**: optimistic checkbox, reverted with a message if the save fails. `PATCH /api/reviews/{id}/comments/{cid}` goes through the owner's RLS client; column grants mean only `addressed_at` (and anchor fields) can change. Logs `comment_addressed`; viewing logs `owner_viewed_feedback` (counts only, no content).
- Drafts stay invisible until the reviewer submits (D20, RLS) — the page says "No feedback yet".
- Revoke/delete controls stay on the review page (built in the earlier M2 slice).

## Acceptance covered
- `e2e/reviewer.spec.ts` "full loop" on chromium + webkit-iphone: reviewer saves a draft → owner sees nothing → reviewer adds a page-2 comment and submits → owner signs in, opens feedback, jumps to comment 2 (marker pulses, in viewport, "Page 2 of 2") → marks it addressed → still addressed after reload. This completes **M2: full happy path on chromium + webkit-iphone**.

## Screenshots
- `img/m2-owner-feedback-{chromium,webkit-iphone}.png`

## Dependencies
- None.

## Known limitations
- Audio player, "original transcript" disclosure and dragging an auto-placed anchor arrive with M3 (they need recordings / AI anchors).
- PDF anchors are pins by page position, so they don't need re-anchoring; the "this part has changed" fallback applies to websites (M4).
