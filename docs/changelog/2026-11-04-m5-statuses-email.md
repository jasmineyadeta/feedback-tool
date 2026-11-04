# M5: owner email on submit, invite statuses (D20), verified end to end

## What and why
- **"Feedback is ready" email** (`ownerEmail` in `lib/server/reviewer.ts`):
  - It's link-only: no comment text, no reviewer email, no artifact content.
  - It now says "your site" or "your PDF" correctly. It used to say "your PDF" even for websites.
  - It has a plain-text and an HTML version.
  - The self-reported reviewer name is flattened to one line, so nothing can be smuggled into email headers, and it's escaped in the HTML.
- **Invite statuses per D20**, now covered by e2e:
  - Not started.
  - Opening the link is *not* tracked (no read receipts), so it stays Not started.
  - In progress after the first saved comment.
  - Submitted.
  - Revoked was already covered in `owner.spec`.
- Mark addressed and the general note were built and tested in M2 (`reviewer.spec` full loop), so those items are ticked now.
- **Live-dev email smoke test.** `pnpm smoke:mail` sends through the **local** Mailer into the local inbox (Mailpit) and finds it there. It isn't part of `pnpm verify`, because verify uses `Mailer.mock`.

## Acceptance items
- ✅ "Email sent in e2e (`Mailer.mock`; local inbox verified in a live-dev smoke test)":
  - `e2e/notify.spec.ts` reads the mock outbox and checks the subject, the link, and that the comment text and reviewer email are absent.
  - `pnpm smoke:mail` passed against local Mailpit on 2026-11-04.
- "Owner email on submit (link only), invite statuses (D20), mark addressed, general note": done.

## Tests
- Unit `apps/web/test/owner-email.test.ts`: wording, header-injection flattening, HTML escaping, empty-name fallback.
- E2E `e2e/notify.spec.ts` (chromium + webkit-iphone).
- Live `apps/web/test/live/mailer.test.ts` (`pnpm smoke:mail`).

## Screenshots
- No visual change apart from a test id on the status badge, so there are no new screenshots.
