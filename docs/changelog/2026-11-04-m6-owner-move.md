# M6: owner moves auto-placed comments; Jas's student sites added

## What and why
- **Move a comment (SPEC §3.3, `anchor_source = owner_moved`).** Jas asked for this before the pilot.
  - Every comment the AI placed ("Auto-placed"), or that only knew what was on screen ("On screen"), now has a **Move** button.
  - Press it, then tap the new spot on the PDF, live site or screenshot. A banner says what to do; **Cancel** or Escape stops.
  - The comment shows **Moved by you**, and the marker appears at the new spot.
  - Comments the reviewer tapped themselves have no Move button: the reviewer chose that spot.
  - SPEC says "drag". This is tap-to-move instead, because it works the same on phones, with a mouse and with a keyboard (the viewers already support keyboard picking). Dragging a marker inside a cross-origin site frame wouldn't work on iOS.
- **Server (`lib/server/owner-move.ts`, `PATCH /api/reviews/{id}/comments/{cid}` with `{anchor}`):**
  - Ownership is checked through RLS.
  - Only auto-placed comments can be moved, and the anchor must fit the review type (`anchorFits`). Website anchors are cleaned so the proxy host and query strings are never stored.
  - Only anchor, source and the derived page columns change. The reviewer's words are never touched.
  - If the comment moves to another page, its submit-time screenshot (of the old page) is detached, and deleted if nothing else uses it.
  - A new event `comment_moved` (migration `20261104000002`) records which source was moved, as a pilot signal for AI placement quality.
- **Student sites (D28):** samdickie.me (Notion-based), laurenselley.com (Squarespace), designalily.com (Webflow) and ktestep.com (Wix) were added to `docs/test-portfolios.json`, and `pnpm gate` was re-run over all sites.

## Acceptance items
- SPEC §3.3 "Owner can drag an auto-placed anchor to a new element": done, as tap-to-move (see above).

## Tests
- `e2e/owner-move.spec.ts` (chromium + webkit-iphone):
  - Move a PDF "On screen" comment to a spot. The database has a `pdf` anchor, `owner_moved`, the same text and one event. The tapped comment has no Move button.
  - Move an AI-placed website comment onto a heading inside the live frame. Escape cancels. The stored anchor has the site's address, never the proxy's.
  - The server refuses: moving a tapped comment, a page that doesn't exist, the wrong anchor kind, and another owner's comment (404). The text is unchanged after a successful move.

## Screenshots
- `img/m6-owner-move-pick-{chromium,webkit-iphone}.png`, `img/m6-owner-move-done-{chromium,webkit-iphone}.png`

## Manual checks
- None new. Moving is part of reading feedback in `docs/DEMO_SCRIPT.md` step 4.

## Known limitations
- On a live site the owner picks an element. Tapping empty space does nothing, and the banner stays until an element is tapped or Cancel is pressed.
- No undo. Move it again instead.
