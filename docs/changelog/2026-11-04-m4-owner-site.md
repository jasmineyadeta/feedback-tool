# M4: owner sees website feedback; re-anchoring falls back to the stored screenshot

## What and why
- **Owner feedback page for website reviews** (SPEC §3.3): the live site on the left with numbered markers, comments on the right, and a bottom sheet on phones.
  - Clicking a comment loads its page in the frame, then the overlay locates the element in the SPEC §4.3 order and pulses it.
  - Page labels and quoted text are shared with the reviewer UI (`lib/artifact.ts`).
- **What the owner sees when the page has changed:**
  - Found by text or element (`textQuote` / `cssPath`): it's simply shown.
  - Found only by position (`rect`, same viewport width): a note says "This part of the page has changed since the review. The marker shows where it was."
  - Not found: a panel shows **the screenshot taken when the reviewer submitted**, labelled "Screenshot", with the numbered marker at the anchor's point, the same message, and "Back to the live page". If there's no screenshot, it says so.
- **Screenshots are taken on submit** (SPEC §4.1). This runs after the response (`after()`), so Submit stays fast.
  - There's one full-page capture per distinct (page, reviewer viewport width) used by that reviewer's website comments, taken at the reviewer's width so document coordinates line up.
  - Captures are stored in the private `screenshots` bucket and linked from `comments.screenshot_file_key`.
  - Caps: 10 per submission and 300 per day (global token bucket). Skipped captures are logged as a `render_fallback` event that records only a count.
  - The owner gets 1 h signed URLs through `/sb`. The existing review and invite deletion already removes these files.
- **The owner's comment column now matches the reviewer's width** (320 px, was 384 px). At the same window size the site renders at the same width for both, so the position fallback lines up.

## Acceptance items
- ✅ "Re-anchor after fixture DOM mutation falls back in the specified order": `e2e/site-owner.spec.ts`, chromium + webkit-iphone.
  - It uses a new fixture page, `apps/proxy/fixtures/static/mutable.html`. Its content version comes from localStorage in the proxied frame, which is per browser context, so it's safe in parallel.
  - The test checks, in order:
    - unchanged → `textQuote` (paragraph) and `cssPath` (image);
    - small text edits plus an image re-wrapped with a new alt → `textQuote` (fuzzy) and `cssPath` (found by image file name);
    - content replaced, same layout → `rect` with the "changed" note;
    - a different window width as well → the stored screenshot with marker 1.
- "Proxy wired into reviewer/owner UIs, multi-page nav, capture-mode click suppression": the owner side is done, which completes this item.
- "Website timeline capture, anchors + re-anchoring, screenshot capture on submit": done. The remaining part, Screenshot mode UI, is the next slice.

## Tests
- Unit `apps/web/test/site-screens.test.ts`: screenshot grouping per page × width, skipping non-website anchors, clamping.
- E2E as above. The PDF owner and reviewer tests still pass with the shared viewer changes.

## Screenshots
- `img/m4-owner-site-rect-{chromium,webkit-iphone}.png`: position fallback with the note.
- `img/m4-owner-site-screenshot-{chromium,webkit-iphone}.png`: stored screenshot with the marker. In e2e this is the mock image; the real service captures the actual page.

## Known limitations
- The owner can't drag a comment to a new element (`owner_moved`, SPEC §3.3). This was also deferred in M3.
- Screenshots are capped at 6000 px tall. A marker further down than that has no image under it.
- Viewport ("On screen") comments show a marker at the left edge of where the reviewer was scrolled.
