# M4: reviewers comment on a live website

## What and why
- **The reviewer link now opens live website reviews** (SPEC §3.2). The site loads in the proxy iframe through a fresh `__enter` URL, made per page load with a proxy token that lasts 6 h. The PDF flow is unchanged.
- **`SiteViewer`** (`apps/web/components/site-viewer.tsx`) runs the shell side of the overlay protocol. Every message is origin-checked and zod-parsed, both ways.
  - **Add comment** starts pick mode. Clicks on the site are suppressed and the tapped element becomes a DOM anchor (SPEC §4.1).
  - The overlay draws numbered markers for comments on the current page.
  - **Multi-page:** the bar above the site shows "Live site" and the current page ("Home page", "/about"). It follows SPA `pushState` and full page loads alike. Mode, markers and any pending "jump to" are re-sent whenever the overlay announces itself, so they survive navigation.
  - **Jump to a comment on another page:** the frame loads that page through `__enter`, then the overlay locates and pulses the element.
  - Links to other sites open in a new tab, and the bar says so.
- **The comment list and composer show where each comment is**, as a page label and the quoted text.
- **Server checks** (`apps/web/lib/server/reviewer.ts`):
  - an anchor must fit the review. PDF reviews accept PDF anchors for pages that exist; live sites accept DOM/viewport anchors; Screenshot mode accepts screenshot anchors.
  - `page_path` is stored.
  - A DOM anchor's `pageUrl` is rewritten to the site's origin + path, so the proxy host and any query string (which might hold personal data) are never stored.

## Acceptance items
- "Proxy wired into reviewer/owner UIs, multi-page nav, capture-mode click suppression": the reviewer side is done. The owner side comes in a later slice.

## Tests
- E2E `e2e/site-reviewer.spec.ts` (chromium + webkit-iphone):
  - a reviewer comments on two pages of the SPA fixture, navigating inside the site;
  - jumping to the home-page comment reloads that page;
  - after a reload, both comments are listed with their page labels;
  - the DB has `page_path` `/` and `/about`, DOM anchors, and `pageUrl` on the real site rather than the proxy.
- E2E: the server refuses a PDF anchor on a website review (400).

## Screenshots
- `img/m4-site-reviewer-chromium.png`, `img/m4-site-reviewer-webkit-iphone.png`

## Known limitations (next slices)
- There's no **Record** button on website reviews yet. Talk-through for websites is the next slice.
- The owner's feedback page doesn't show website reviews yet.
- Screenshot-mode reviews still show the reviewer the "link not found" page.
