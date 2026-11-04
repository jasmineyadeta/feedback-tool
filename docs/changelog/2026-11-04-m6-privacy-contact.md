# M6: privacy notice (Phase A wording) and contact/takedown page

## What and why
- **`/privacy`** says plainly that this test version runs on one computer:
  - Audio is transcribed and matched to the page here, so it stays on this computer.
  - Audio is deleted after 90 days; comment text stays until the owner deletes the review.
  - Nothing is used to train AI.
  - It lists what's kept about reviewers and owners, and what we don't do (no ads, no tracking tools, no search listing; usage events carry no content, emails or full addresses).
  - M7 must rewrite the "where it runs" wording with the cloud provider's current terms.
- **`/contact`** is the takedown route (PRD §14):
  - It shows `CONTACT_EMAIL` when set.
  - When unset, it says no address is set up and to contact the person who sent the link. It never shows a made-up address.
  - It also lists the faster ways: the owner deletes the review, or the reviewer asks them to.
- **Links:** home and sign-in have a small footer. The recording consent sheet and the submit sheet link to the privacy notice in a new tab, so the reviewer doesn't leave their review.
- New optional env var `CONTACT_EMAIL` (documented in `.env.example`). No new dependencies.

## Acceptance items
- "Privacy notice (audio stays on this computer), takedown/contact page": done.

## Tests
- E2E `e2e/legal.spec.ts` (chromium + webkit-iphone):
  - The pages are public and linked from home and sign-in.
  - axe finds no serious or critical issues.
  - The contact page has no fake address when `CONTACT_EMAIL` is unset.
  - The reviewer links open in a new tab while the submit sheet stays open.

## Screenshots
- `img/m6-privacy-chromium.png`, `img/m6-privacy-webkit-iphone.png`
- `img/m6-contact-chromium.png`, `img/m6-contact-webkit-iphone.png`

## Manual checks
- None new.

## Known limitations
- No takedown form. Requests go by email, so Jas needs to set `CONTACT_EMAIL` before sharing links widely.
