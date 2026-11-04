# M2: reviewer PDF flow — viewer, pinned comments, autosave, submit

## What / why
- **Reviewer page `/r/{token}`** (SPEC §3.2): the server hashes the token (SHA-256) and looks up the invite with the service role. Unknown, revoked and deleted links render the *same* 404 page ("This review link isn't available"), so a link's state can't be probed. Page is `noindex`, `no-referrer`.
- **pdf.js viewer** (`components/pdf-viewer.tsx`): lazy page rendering (IntersectionObserver), fit-to-width + zoom 50–300%, "Page n of N", selectable text layer, canvas DPR capped for iOS canvas limits. Worker is served same-origin from `public/` (copied from `pdfjs-dist` at dev/build; gitignored).
- **Anchoring** (SPEC §4.2): "Add comment" → tap the page → `PdfAnchor` pin (`rectPdf` in PDF user space via `convertToPdfPoint`, `point` in %). Selecting text → "Comment on selection" → anchor with `textQuote` (exact + 32-char prefix/suffix) and the selection's PDF rect. Numbered markers; quote anchors get a highlight.
- **Autosave + IndexedDB** (`lib/client/drafts.ts`): every change goes to IndexedDB first and into a versioned queue; a debounced (1 s) sync sends idempotent ops keyed by `clientId`; an entry leaves the queue only when the server ACKs *that version* (edits made mid-request stay queued). On reload, queued local changes are replayed over server state. Retries on `online` and every 15 s. Status line: Saving… / All changes saved / Offline — saved on this device.
- **Reviewer API** (`/api/r/[token]/sync|submit|pdf`): every query is scoped by the resolved invite id; zod (`SyncRequest`, `SubmitRequest` in `@ft/shared/reviewer`) at the boundary; per-invite rate limits; comment cap (60) and page bounds enforced server-side; submitted invites are read-only (409). Status moves `not_started → in_progress` on the first saved comment (`first_comment_saved` event).
- **Submit sheet**: optional general note (stored as an unanchored `general` comment), name prefilled from the hint, email; flushes the queue first and refuses to submit unsynced work. Owner gets an email (local inbox) with a link — no comment content in the email.
- Coach mark (dismissable, remembered on the device).

## Acceptance covered (`e2e/reviewer.spec.ts`, chromium + webkit-iphone)
- Full reviewer happy path → owner sees *Submitted*; late writes after submit → 409.
- Refresh mid-draft restores comments that never reached the server, then they sync.
- Offline (`context.setOffline`) save queues and syncs on reconnect.
- Revoked and unknown links → identical 404 page; API → 404.
- Cross-invite: the same `clientId` from another invite's link can't delete/overwrite (rows scoped per invite). Cross-owner: another owner gets 404 on page and DELETE API.
- Deleting a review removes the PDF from storage and kills reviewer links.

## Screenshots
- `img/m2-reviewer-compose-{chromium,webkit-iphone}.png`
- `img/m2-reviewer-submit-{chromium,webkit-iphone}.png`
- `img/m2-reviewer-submitted-{chromium,webkit-iphone}.png`

## Dependencies
- `fake-indexeddb@6.2.7` (dev only): IndexedDB in Node unit tests for the draft store. No new runtime dependencies.

## Known limitations
- The owner feedback view (`/reviews/{id}/feedback`) is the next slice.
- Selection anchors on iOS rely on native long-press selection in the pdf.js text layer; works in WebKit automation, needs a real-iPhone check (MANUAL_CHECKS).
- One run (of ~40) saw the revoked-link navigation return 200 in chromium right after revoke; not reproducible in 44 subsequent runs (incl. 8× isolated, 3× full-spec repeat). Watching for it.
- Signed PDF URL in the page lasts 10 minutes; the document is fetched once on load, so this only matters if the first load is delayed that long (reload fixes it).
