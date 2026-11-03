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
- [ ] Create PDF review, invites, reviewer link, pdf.js viewer (zoom, pages, text layer)
- [ ] Tap/select to anchor, typed comments, autosave + IndexedDB restore, submit w/ name/email
- [ ] Owner feedback view with navigate-to-anchor, revoke, delete
- [ ] ✅ E2E full happy path on chromium + webkit-iphone
- [ ] ✅ Refresh mid-draft restores comments
- [ ] ✅ Offline save queues and syncs
- [ ] ✅ Revoked link 404s
- [ ] ✅ Cross-owner and cross-invite access denied
- [ ] ✅ Deleting review removes storage objects

## M3 — Talk-through recording (PDF first)
- [ ] Spike: whisper.cpp word-level timestamps on iPhone `audio/mp4` (switch to faster-whisper if unusable)
- [ ] Recorder, disclosure + consent, bar UI, IndexedDB buffer, upload, local transcription
- [ ] Tap split, AI resolver + validator, split preview with "Looks good", edit/re-anchor/merge/delete
- [ ] Owner audio playback, 90-day purge job
- [ ] Transcriber/LLM down or slow → audio kept, `pending`, friendly message, retry with backoff
- [ ] `pnpm eval:anchors` (≥15 cases, ≥80% to adopt model) → `docs/ANCHOR_EVAL.md`
- [ ] ✅ Validator rejects reworded/missing/duplicated spans (property tests)
- [ ] ✅ Tap overrides AI
- [ ] ✅ Permission denied → typed path offered
- [ ] ✅ Transcription failure → retry, audio not lost, typed fallback
- [ ] ✅ Purge job deletes expired audio
- [ ] *Manual:* record on real iPhone Safari and iPad

## M4 — Website review (live + Screenshot mode)
- [ ] Proxy wired into reviewer/owner UIs, multi-page nav, capture-mode click suppression
- [ ] Website timeline capture, anchors + re-anchoring, screenshot capture on submit, Screenshot mode UI with labels
- [ ] ✅ Fixture e2e: talk-through on SPA fixture across 2 pages → correctly anchored comments (mocked AI)
- [ ] ✅ Re-anchor after fixture DOM mutation falls back in the specified order
- [ ] ✅ Screenshot-mode site labelled to reviewer and owner
- [ ] *Manual:* 3 live Framer/Webflow sites on real iPhone

## M5 — Notifications, status, polish
- [ ] Owner email on submit (link only), invite statuses (D20), mark addressed, general note
- [ ] Empty/loading/error states; accessibility pass (keyboard, labels, focus, non-color markers)
- [ ] ✅ axe: zero serious/critical violations on key pages
- [ ] ✅ Email sent in e2e (`Mailer.mock`; local inbox verified in a live-dev smoke test)

## M6 — Phase A wrap-up
- [ ] Privacy notice (audio stays on this computer), takedown/contact page
- [ ] Rate limits verified; metrics SQL views (PRD §15)
- [ ] `docs/DEMO_SCRIPT.md`, `docs/PHASE_B_PLAN.md`
- [ ] ✅ Load smoke: 10 concurrent simulated reviewers locally without errors
- [ ] *Manual:* Jas completes a full review as reviewer on her iPhone through the tunnel

---

## Milestone summaries

### M1 — done (2026-11-03)
**Works:** document proxy (wrangler dev) with HMAC tokens, SSRF guard, path-preserving `__enter` flow, HTML rewriting, header stripping, rate limits; overlay (39 KB) with SPA history patch, SW/form blocking, record/pick modes, taps, timeline snapshots, anchor show/locate; anchoring with SPEC §4.3 fallback order; 6 fixtures × 9 e2e tests in both browsers; live gate 80% (12/15), D3 pass → live by default.
**Doesn't yet:** proxy isn't wired into the reviewer/owner UI (M4); per-review health check + Screenshot mode UI (M4).
**Manual checks pending for Jas:** none for M1.

### M0 — done (2026-11-03)
**Works:** pnpm monorepo (`apps/web` Next 16, `apps/proxy` Worker stub, `packages/{shared,anchoring,overlay}`); full schema + RLS migration; RLS tests against local Supabase (cross-owner isolation, comments hidden until submit, owners can't rewrite reviewer text, rate-limit token bucket); D30 registry with mock adapters (+ local Mailer via Mailpit and local ProxyHost); `pnpm setup` (idempotent), `dev`, `dev:stop`, `dev:phone`, `verify`, `merge-task`.
**Not yet:** local Transcriber / AnchorResolver / ScreenshotService adapters (M1/M3); proxy is a stub (M1).
**Manual checks pending for Jas:** none for M0.
