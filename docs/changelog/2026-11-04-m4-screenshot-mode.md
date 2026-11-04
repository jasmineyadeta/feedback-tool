# M4: Screenshot mode for reviewers and owners, always labelled

## What and why
- **A review in Screenshot mode never pretends to be the live site** (PRD non-negotiable).
  - The reviewer sees the entry-page screenshot taken at review creation. The phone gets the 390 px one and wider screens get the 1280 px one.
  - A yellow **Screenshot** label sits permanently above it: "This is a picture of the site, not the live site. Links and buttons won't work."
  - No proxy frame is loaded at all.
- **Typed comments:** Add comment → tap the picture → a `screenshot` anchor, with the point as a percentage of the image and an `imageKey` like `entry-390`.
- **Talk-through works the same way.**
  - While recording, the viewer reports "what's on screen" every second and at the end of a scroll, as a screenshot anchor at the centre of the visible area.
  - Untapped speech is placed **On screen**, and taps are **Tapped**.
  - The validator and the never-reword rule are unchanged.
- **The owner's feedback page** shows the same screenshot with numbered markers, under the label "Reviewers saw this screenshot, not the live site." The review page already explained the mode and why.
- **Server checks:** a Screenshot-mode review accepts only screenshot anchors whose `imageKey` matches `entry-<width>`, so storage paths can't be smuggled in. Screenshot URLs are signed for 6 h (reviewer) or 1 h (owner) and served through the app.
- Added "M4 — Live websites on a real iPhone" to `docs/MANUAL_CHECKS.md`.

## Acceptance items
- ✅ "Screenshot-mode site labelled to reviewer and owner": `e2e/screenshot-mode.spec.ts`, chromium + webkit-iphone. It checks:
  - the reviewer label and that there's no live frame;
  - the right screenshot width per device;
  - a typed comment;
  - a talk-through ("On screen" + "Tapped");
  - submit;
  - the owner label with markers.
- "Website timeline capture, anchors + re-anchoring, screenshot capture on submit, Screenshot mode UI with labels": complete with this slice.
- E2E: the server refuses DOM/viewport anchors and unknown image keys on a Screenshot-mode review.

## Screenshots
- `img/m4-screenshot-reviewer-{chromium,webkit-iphone}.png`, `img/m4-screenshot-owner-{chromium,webkit-iphone}.png`. In e2e the image is the mock page.

## Known limitations
- Screenshot mode covers the entry page only, so reviewers can't move to other pages (the owner is told this up front).
- In Screenshot mode the AI step gets no on-screen elements, so untapped speech is always placed "On screen".
