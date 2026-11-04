# M4: owner creates website reviews — health check picks live or Screenshot mode

## What and why
- **New review → Website / PDF choice** (Website is the default). The owner pastes the address of the page reviewers start on.
- **Server checks the site before saving anything** (SPEC §3.1):
  1. URL validated server-side (https only, public DNS, no private IPs; fixture hosts only in `ENVIRONMENT=test`).
  2. The proxy's `/__health` fetches the document through the SSRF guard and checks it's HTML. If the page can't be fetched at all (404, not a web page, redirects to another site, timeout), creation is refused with a plain next step. No mode can help in that case.
  3. A headless check through `ScreenshotService` frames the proxied page from the app origin and waits up to 8 s for `overlay:ready`, with no page error.
  4. **Live** if both pass. **Screenshot mode** if the platform is on the gate's screenshot list or the headless check fails. Screenshot mode stores full-page entry screenshots at 390 px and 1280 px in the private `screenshots` bucket.
- **The owner's review page says which mode will be used and why**, in plain words. Screenshot mode is shown in an amber box that says reviewers can't click through to other pages.
- **The health report is stored** in `reviews.health_report`: mode, reason, platform, timings, screenshot keys. Page errors are stored only as the code `script-error`, never their text (it could contain site content).
- **Deleting a review also deletes its entry screenshots.**
- **Local `ScreenshotService` (Phase A).** It uses headless Chromium from `playwright-core` and only ever loads proxied URLs, so the proxy's SSRF guard still applies.
  - Chromium's Local Network Access checks block a Playwright-fulfilled page (which has no address) from framing a localhost proxy. So the check opens a real app-origin page (`/api/health`) and adds the frame there.
  - I confirmed this by hand against the fixture proxy: ready in 0.1–0.3 s, and the screenshots look right.
- **The mock `ScreenshotService` now returns a real PNG** of the requested size (a pale page with grey text bars), so Screenshot-mode UI tests have something page-like to show.

## Acceptance items
- Partly covers "Proxy wired into reviewer/owner UIs" and "Screenshot mode UI with labels" (owner side). The reviewer side comes in the next slices.

## New runtime dependency
- `playwright-core@1.64.1` in `apps/web`: the Phase A local `ScreenshotService` (D30). It's the same version as the repo's `@playwright/test`, so it uses the browsers `pnpm setup` already installs. It's loaded only when `SCREENSHOT=local` (dynamic import) and is in `serverExternalPackages`. No account, no cost. Phase B replaces it with Browser Run behind the same interface.

## Tests
- Unit (`apps/web/test/site-health.test.ts`): mode decision for every failure reason, owner copy, proxy-failure messages, screenshot width choice, mock PNG validity.
- E2E (`e2e/website.spec.ts`, chromium + webkit-iphone):
  - a healthy fixture site → Live;
  - a failed headless check → labelled Screenshot mode, with both PNGs stored;
  - 404 and private-IP addresses refused with a message, and no review created.
- The e2e helper `createPdfReview` now picks "PDF" first, since Website is the default.

## Screenshots
- `img/m4-new-review-website-chromium.png`, `img/m4-new-review-website-webkit-iphone.png`
- `img/m4-review-screenshot-mode-chromium.png`, `img/m4-review-screenshot-mode-webkit-iphone.png`

## Known limitations
- Reviewers can't open website reviews yet: the reviewer page shows the 404 page for them until the next slice.
- There's no "Check again" button. To re-check a site, create the review again.
- Creating a website review takes a few seconds (up to ~20 s on a slow site). The button says so.
