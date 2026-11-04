# M4: talk-through on live websites

## What and why
- **Record works on website reviews** (SPEC §3.2 steps 3–5, §5.1).
  - While recording, the overlay sends a snapshot of the visible elements every second and at the end of a scroll. Each tap is sent with a full DOM anchor.
  - The shell stamps every snapshot and tap with the recorder's own clock. The frame has a separate clock, and pauses are excluded.
  - From there, the existing pipeline runs unchanged: tap split → AI placement → validator → viewport fallback → split preview → Looks good.
- **Element IDs are unique across pages.** The overlay's element IDs restart on every page load, so the shell prefixes them with a page-load number. That stops "e3 on /work" from being mistaken for "e3 on the home page" when the AI's pick is checked and turned into an anchor.
- **Moving between pages while recording:**
  - Same-site links still navigate in capture mode; that's how a reviewer moves between pages while talking. Other clicks are still suppressed and become taps.
  - **Pause** hands the site back to normal clicking (menus, buttons). Resuming goes back to capture mode.
  - Mode, markers and recording state are re-sent to the overlay after each page load. Overlay version 0.2.0.
- **Preview and re-anchor work for website anchors.** Cards show the page ("Home page", "/work"), and Re-anchor uses tap-to-pick inside the site.
- E2E talk-through helpers moved to `e2e/helpers/talk.ts` so the PDF and website specs share them (no test changed).

## Acceptance items
- ✅ "Fixture e2e: talk-through on SPA fixture across 2 pages → correctly anchored comments (mocked AI)": `e2e/site-talk-through.spec.ts`, chromium + webkit-iphone.
  - The reviewer records on Home, follows the Work link, and taps "Hospital dashboard".
  - The untapped sentence is auto-placed on the home headline it names.
  - The tapped sentence is anchored to the tapped heading on `/work`.
  - The DB has `page_path` `/` and `/work`, sources `ai` and `tap`, both DOM anchors with the right quotes.

## Screenshots
- `img/m4-site-recording-{chromium,webkit-iphone}.png`: recording with a tap marker on /work.
- `img/m4-site-preview-{chromium,webkit-iphone}.png`: split preview with page labels.

## Known limitations
- Tap numbers drawn in the site restart at 1 on each new page; the preview order is still correct.
- A tap on a same-site link navigates instead of pointing at it. To comment on a link itself, use Add comment.
- The owner's feedback page doesn't show website reviews yet (next slice).
