# Progress (Phase A, M0–M6)

From SPEC §8: one checkbox per acceptance criterion. *Manual* items are listed in `docs/MANUAL_CHECKS.md` for Jas. M7 is not started until Jas says so.

**Resume point:** see the first unchecked item below. Branch naming `m{N}/{slug}`; merge only via `pnpm merge-task`.

## M0 — Scaffold & local toolchain
- [x] Monorepo, TS strict, ESLint/Prettier, Vitest, Playwright (chromium, webkit-iphone, webkit-ipad)
- [x] Supabase migrations + RLS + seed; local dev via Supabase CLI
- [x] `pnpm setup`, `pnpm dev`, `pnpm dev:phone`, `pnpm verify`, `pnpm merge-task`; D30 interfaces with `mock` implementations
- [x] `README.md`, `.env.example`
- [x] ✅ `pnpm verify` green on an empty-app smoke test in both browsers
- [x] ✅ `pnpm setup` re-run is a no-op

## M1 — Proxy feasibility gate
- [x] Worker: token verification, SSRF guard, rewriting, overlay ready/tap/nav messages
- [x] `ALLOW_FIXTURE_HOSTS` honored only when `ENVIRONMENT=test` (unit test proves it's ignored otherwise)
- [x] Fixtures: static, SPA w/ client router, CSP+XFO, service worker, forms, animations/canvas
- [x] ✅ Fixture e2e green
- [x] `pnpm gate` script → `docs/PLATFORM_SUPPORT.md`
- [x] ✅ Gate report committed
- [x] ✅ D3 rule applied (Screenshot mode auto-chosen for failing platform fingerprints if below threshold)

## M2 — PDF review end to end (typed comments)
- [x] Owner magic-link auth (local inbox) + dev-only sign-in shortcut, with test proving it's absent in production
- [x] Create PDF review, invites, reviewer link, pdf.js viewer (zoom, pages, text layer)
- [x] Tap/select to anchor, typed comments, autosave + IndexedDB restore, submit w/ name/email
- [x] Owner feedback view with navigate-to-anchor, revoke, delete
- [x] ✅ E2E full happy path on chromium + webkit-iphone
- [x] ✅ Refresh mid-draft restores comments
- [x] ✅ Offline save queues and syncs
- [x] ✅ Revoked link 404s
- [x] ✅ Cross-owner and cross-invite access denied
- [x] ✅ Deleting review removes storage objects

## M3 — Talk-through recording (PDF first)
- [x] Spike: whisper.cpp word-level timestamps on iPhone `audio/mp4` (switch to faster-whisper if unusable)
- [x] Recorder, disclosure + consent, bar UI, IndexedDB buffer, upload, local transcription
- [x] Tap split, AI resolver + validator, split preview with "Looks good", edit/re-anchor/merge/delete
- [x] Owner audio playback, 90-day purge job
- [x] Transcriber/LLM down or slow → audio kept, `pending`, friendly message, retry with backoff
- [x] `pnpm eval:anchors` (≥15 cases, ≥80% to adopt model) → `docs/ANCHOR_EVAL.md`
- [x] ✅ Validator rejects reworded/missing/duplicated spans (property tests)
- [x] ✅ Tap overrides AI
- [x] ✅ Permission denied → typed path offered
- [x] ✅ Transcription failure → retry, audio not lost, typed fallback
- [x] ✅ Purge job deletes expired audio
- [ ] *Manual:* record on real iPhone Safari and iPad

## M4 — Website review (live + Screenshot mode)
- [x] Proxy wired into reviewer/owner UIs, multi-page nav, capture-mode click suppression
- [x] Website timeline capture, anchors + re-anchoring, screenshot capture on submit, Screenshot mode UI with labels
- [x] ✅ Fixture e2e: talk-through on SPA fixture across 2 pages → correctly anchored comments (mocked AI)
- [x] ✅ Re-anchor after fixture DOM mutation falls back in the specified order
- [x] ✅ Screenshot-mode site labelled to reviewer and owner
- [ ] *Manual:* 3 live Framer/Webflow sites on real iPhone

## M5 — Notifications, status, polish
- [x] Owner email on submit (link only), invite statuses (D20), mark addressed, general note
- [ ] Empty/loading/error states; accessibility pass (keyboard, labels, focus, non-color markers)
- [ ] ✅ axe: zero serious/critical violations on key pages
- [x] ✅ Email sent in e2e (`Mailer.mock`; local inbox verified in a live-dev smoke test)

## M6 — Phase A wrap-up
- [ ] Privacy notice (audio stays on this computer), takedown/contact page
- [ ] Rate limits verified; metrics SQL views (PRD §15)
- [ ] `docs/DEMO_SCRIPT.md`, `docs/PHASE_B_PLAN.md`
- [ ] ✅ Load smoke: 10 concurrent simulated reviewers locally without errors
- [ ] *Manual:* Jas completes a full review as reviewer on her iPhone through the tunnel

---

## Milestone summaries

### M4 — done except the real-iPhone site check (2026-11-04)
**Works:** owner creates **Website** reviews; the server validates the URL, health-checks through the proxy and headless Chromium (local `ScreenshotService`, playwright-core) and picks **Live** or **Screenshot mode**, explained in plain words. Reviewers comment on the live site in the proxy iframe (DOM anchors, multi-page: SPA and full loads, path bar, jump to other pages); talk-through works across pages (links navigate while recording, Pause hands the site back, eids namespaced per page load, AI + tap anchors). Owner sees the live site with markers; re-anchoring falls back textQuote → cssPath → rect (with a "changed" note) → the screenshot taken at submit with the marker. Screenshot mode: labelled picture for reviewer and owner, typed + talk-through comments. Anchors validated per review type; proxy host and query strings never stored.
**Doesn't yet:** owner can't drag anchors (`owner_moved`); Screenshot mode is entry page only; tap numbers in the site restart per page.
**Manual checks pending for Jas:** "M4 — Live websites on a real iPhone" (3 real Framer/Webflow sites) in `docs/MANUAL_CHECKS.md`. Still open: M2 and M3 real-device checks.

### M3 — done except the real-device check (2026-11-03)
**Works:** spike chose whisper.cpp (≤0.54 s early, no VAD); Record with disclosure + consent; recording bar (pause/stop/cancel, 10-min cap); taps while talking; PDF timeline (visible lines every second); audio kept in IndexedDB (as bytes, Safari-safe) + memory until the server ACKs; upload with magic-byte checks; local transcription with retry/backoff and a "taking longer" message; tap split → AI placement (qwen3:14b via Ollama, prompt v2, 87% on `pnpm eval:anchors`, 4/6 held-out) → mandatory validator (property-tested) → viewport fallback; split preview with edit / re-anchor / merge (server-side) / delete / Looks good; owner badges, original transcript, clip playback; 90-day audio purge job. 10 talk-through e2e × 2 browsers.
**Doesn't yet:** owner can't drag an auto-placed anchor; website reviews (M4).
**Manual checks pending for Jas:** "M3 — Talk-through on real devices" in `docs/MANUAL_CHECKS.md` (iPhone + iPad recording; needs `pnpm dev:phone`). Also still open: "M2 — PDF reviewer on a real iPhone".

### M2 — done (2026-11-03)
**Works:** owner magic-link sign-in (local inbox) + dev shortcut proven absent in production; PDF upload validated server-side (type, 15 MB, 30 pages); one-time reviewer links with revoke/delete; reviewer page with pdf.js viewer (lazy pages, zoom, text layer), tap-to-pin and select-to-quote anchors, typed comments, IndexedDB-first autosave with versioned ACK queue (survives refresh and offline), general note, submit with name/email (owner emailed, no content in email), read-only after submit; owner feedback view with markers, jump-to-anchor, reviewer filter, mark addressed. Unknown/revoked/deleted links share one 404 page. E2E: 7 reviewer/owner tests × chromium + webkit-iphone.
**Doesn't yet:** recording/transcription and AI anchors (M3); website reviews (M4).
**Manual checks pending for Jas:** "M2 — PDF reviewer on a real iPhone" in `docs/MANUAL_CHECKS.md` (needs `pnpm dev:phone`).

### M1 — done (2026-11-03)
**Works:** document proxy (wrangler dev) with HMAC tokens, SSRF guard, path-preserving `__enter` flow, HTML rewriting, header stripping, rate limits; overlay (39 KB) with SPA history patch, SW/form blocking, record/pick modes, taps, timeline snapshots, anchor show/locate; anchoring with SPEC §4.3 fallback order; 6 fixtures × 9 e2e tests in both browsers; live gate 80% (12/15), D3 pass → live by default.
**Doesn't yet:** proxy isn't wired into the reviewer/owner UI (M4); per-review health check + Screenshot mode UI (M4).
**Manual checks pending for Jas:** none for M1.

### M0 — done (2026-11-03)
**Works:** pnpm monorepo (`apps/web` Next 16, `apps/proxy` Worker stub, `packages/{shared,anchoring,overlay}`); full schema + RLS migration; RLS tests against local Supabase (cross-owner isolation, comments hidden until submit, owners can't rewrite reviewer text, rate-limit token bucket); D30 registry with mock adapters (+ local Mailer via Mailpit and local ProxyHost); `pnpm setup` (idempotent), `dev`, `dev:stop`, `dev:phone`, `verify`, `merge-task`.
**Not yet:** local Transcriber / AnchorResolver / ScreenshotService adapters (M1/M3); proxy is a stub (M1).
**Manual checks pending for Jas:** none for M0.
