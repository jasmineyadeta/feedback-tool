# Build Spec — Contextual Feedback MVP

This supersedes Part IV/V of `PRD.md`. `PRD.md` remains the product context (principles, privacy, UX tone). Where they disagree, **DECISIONS.md > SPEC.md > PRD.md**.

Core loop: **Open → Explore → Talk (tap if you want) → Looks good → Submit.**

## 0. Phase A — local POC runtime (build this now)

Everything runs on Jas's Mac with **no accounts** (DECISIONS D16, D29–D32). The architecture below is the Phase B picture; in Phase A each box maps to a local process:

| Box | Phase A (local) | Phase B (cloud, later) |
|---|---|---|
| App | `next dev` on `localhost:3000` | Vercel |
| Supabase | Supabase CLI in Docker (`localhost:54321`), local email inbox (Mailpit/Inbucket UI) | Supabase cloud |
| Proxy | `wrangler dev` on `localhost:8787` (single host, `__enter` cookie flow, §6) | Worker on `{rid}.view.{DOMAIN}` |
| Screenshots / headless health check | Local Playwright Chromium (`ScreenshotService.local`) | Cloudflare Browser Run |
| Transcription | `whisper.cpp` server on `localhost:8178` + `ffmpeg` normalization (`Transcriber.local`) | Workers AI Whisper |
| Anchor LLM | Ollama on `localhost:11434` (`AnchorResolver.local`) | Workers AI LLM |
| Email | Supabase local SMTP inbox (`Mailer.local`) | Resend |
| Git/CI | local branches + `pnpm verify` + `pnpm merge-task` | GitHub PRs + Actions |

Commands the agent must provide:
- `pnpm setup` — checks/installs prerequisites via Homebrew (`node@22`, `pnpm`, `supabase/tap/supabase`, `whisper-cpp`, `ffmpeg`, `ollama`, `cloudflared`), downloads the Whisper model and the chosen Ollama model, `supabase start`, runs migrations + seed. Idempotent; prints a clear checklist of what's done. Never uses `sudo`.
- `pnpm dev` — starts Supabase (if not running), whisper server, Ollama, `wrangler dev`, `next dev`; prints URLs incl. the local email inbox.
- `pnpm dev:phone` — `pnpm dev` + two `cloudflared` quick tunnels (app, proxy); prints both URLs and a QR code for the app URL; sets `APP_ORIGIN`/`PROXY_ORIGIN` accordingly (D31).
- `pnpm verify` — typecheck, lint, unit, e2e (chromium + webkit-iphone) with `MOCK_AI=1`, build.
- `pnpm merge-task` — refuses unless on a task branch with a clean tree and `pnpm verify` green; then squash-merges to `main` with a descriptive message and deletes the branch.
- `pnpm gate`, `pnpm eval:anchors`, `pnpm test:live-ai` — see §8.

---

## 1. Architecture (Phase B picture — see §0 for Phase A mapping)

```
┌──────────────────────────── app origin (Vercel, Next.js) ────────────────────────────┐
│  Owner UI (auth)        Reviewer UI (/r/[token])          API routes (server-only)     │
│  - create review        - app shell: recorder, comment     - reviews, invites, comments│
│  - invites              list, split preview, submit        - upload (PDF/audio)        │
│  - feedback view        - <iframe src=proxy|pdf viewer>    - transcribe, resolve-anchor│
│                                │  postMessage (origin-checked)  - proxy-token issuer   │
└────────────────────────────────┼─────────────────────────────────────────────────────┘
                                 ▼
┌──────── proxy origin (Cloudflare Worker, *.workers.dev) ────────┐     ┌── Supabase ──┐
│ GET {rid}.view.DOMAIN/{originPath}  (path preserved, §6)         │     │ Postgres+RLS │
│  verify HMAC + exp + eTLD+1  → fetch upstream HTML (SSRF-safe)   │     │ Storage      │
│  HTMLRewriter: <base>, rewrite same-site links, strip CSP/XFO/   │     │ Auth (magic) │
│  Set-Cookie, inject overlay.js                                   │     └──────────────┘
│ GET /__health (app-signed) → proxy health check result           │     ┌─ CF Workers AI┐
│ POST /__screenshot (app-signed) → Browser Run → PNG bytes to app │     │ whisper      │
│   (app stores in Supabase `screenshots/`)                        │     │              │
└──────────────────────────────────────────────────────────────────┘     │ LLM (JSON)   │
                                                                         └──────────────┘
```

Packages (monorepo, pnpm workspaces):

- `apps/web` — Next.js app (owner + reviewer UIs, API routes).
- `apps/proxy` — Cloudflare Worker (wrangler).
- `packages/overlay` — script injected into proxied pages (built to a single IIFE, served by the Worker).
- `packages/anchoring` — shared anchor types, serialization, re-anchoring algorithm (used by overlay, PDF viewer, and server).
- `packages/shared` — zod schemas for API + postMessage protocol.

Module boundaries (PRD §13): rendering (proxy/pdf) ⟂ anchoring ⟂ capture (recorder) ⟂ transcription/anchor-resolution ⟂ persistence. Each behind an interface; no cross-imports except via `packages/shared` types.

## 2. Data model (Postgres, Supabase)

All IDs `uuid`. All tables RLS-enabled. Reviewer access never uses RLS user identity — it goes through server API routes that verify the reviewer token and use the service role with explicit `invite_id` scoping.

**reviews** — owner's artifact
- `id`, `owner_id` (auth.users), `artifact_type` (`website`|`pdf`), `site_url` (normalized), `site_etld1`, `pdf_file_key`, `pdf_page_count`, `title`, `context` (≤1000 chars), `render_mode` (`live`|`screenshot`|null for pdf), `health_report` jsonb, `created_at`, `updated_at`, `deleted_at`

**reviewer_invites** — one per reviewer (D5)
- `id`, `review_id`, `token_hash` (sha256 of 32-byte random token; token shown once in link), `name_hint`, `reviewer_name`, `reviewer_email`, `status` (`not_started`|`in_progress`|`submitted`|`revoked`), `audio_consent_at`, `submitted_at`, `revoked_at`, `created_at`

**recordings** — one per talk-through take
- `id`, `invite_id`, `audio_file_key`, `mime_type`, `duration_ms`, `transcript_text`, `transcript_words` jsonb `[{w,start,end}]`, `timeline` jsonb (visible-element snapshots + taps, §5), `resolver_status` (`pending`|`ok`|`rejected`|`failed`), `delete_audio_after` (created_at + 90d), `created_at`

**comments**
- `id`, `invite_id`, `review_id` (denormalized for owner queries), `recording_id` nullable, `page_path` (website) / `pdf_page` (pdf), `text` (current, editable), `transcript_original` (verbatim span, immutable), `span_start_ms`, `span_end_ms`, `anchor` jsonb (§4), `anchor_source` (`tap`|`ai`|`viewport`|`manual`|`owner_moved`), `anchor_confidence` numeric nullable, `screenshot_file_key` nullable, `state` (`draft`|`saved`), `addressed_at` nullable (owner), `general` boolean (overall note, no anchor), `created_at`, `updated_at`

**review_events** — `id`, `review_id`, `invite_id` nullable, `type` (enum: `review_created`,`invite_created`,`first_comment_saved`,`recording_transcribed`,`ai_anchor_rejected`,`submitted`,`owner_viewed_feedback`,`comment_addressed`,`render_fallback`), `meta` jsonb (no content, no emails, no URLs beyond eTLD+1), `created_at`

Storage buckets (private): `pdfs/`, `audio/`, `screenshots/`. Access only via short-lived signed URLs (≤10 min) minted by API routes after authz.

Deletion: deleting a review hard-deletes invites, recordings, comments, events and storage objects (background job + immediate storage delete attempt). Daily scheduled job (Phase A: in-process scheduler started by `pnpm dev`, plus `pnpm jobs:run` for tests; Phase B: Vercel cron) deletes audio past `delete_audio_after` and nulls `audio_file_key`.

## 3. Key flows

### 3.1 Owner creates review
1. Magic-link sign-in → `/reviews/new`.
2. Choose **Website URL** or **PDF**. Title + context optional.
3. Website: server validates URL (https only, public DNS, not private IP, ≤5 redirects each re-validated) → issues signed proxy token → calls Worker `/health`. Health check = fetch document OK + HTML parseable + no hard blockers; then a headless check via `ScreenshotService` loads the proxied page and confirms `overlay:ready` postMessage within 8s and no fatal JS error. Result → `render_mode` `live` or `screenshot` + `health_report`. Owner sees which mode will be used and why, in plain words.
4. PDF: upload via signed upload URL; server validates magic bytes, size, page count (pdf.js on server), stores.
5. Owner adds reviewer invites (name hint optional) → each gets a copyable link + "Share" (Web Share API) + prefilled email text to copy.

### 3.2 Reviewer
1. Opens `/r/{token}` → server resolves invite (constant-time hash compare; revoked/deleted → friendly dead-end page). Status unchanged until first saved comment.
2. Sees candidate's title + context in a collapsible header and the artifact filling the screen. One-time 3-line coach mark: "Hit record and talk. Tap things to point at them. That's it." (dismissable; not a tutorial).
3. **Record**: first time → audio disclosure sheet (recorded, transcribed (Phase A: on this computer; Phase B: by our speech-to-text provider), audio kept 90 days for the candidate to hear, not used for training) → mic permission. Recording bar: red dot, elapsed time, Pause, Stop, Cancel. Overlay enters capture mode: site clicks suppressed, tapped elements flash-outlined with a numbered marker.
4. Reviewer scrolls/navigates pages and talks. Multi-page: navigating within site works during recording (recorder lives in the app shell, the iframe navigates).
5. **Stop** → audio uploads (kept in IndexedDB until server ACK) → transcribe → resolve anchors (§5) → **split preview**: list of comment cards, each with snippet + anchor highlight thumbnail + source badge (Tapped / Auto-placed / On screen). Tap a card to edit text, re-anchor (tap element), merge with previous, or delete. **"Looks good"** saves all as `saved`.
6. **Type**: button → tap an element → text box → save.
7. **General note** (unanchored) available on submit sheet.
8. **Submit** → sheet asks name (prefilled from hint) + email + "Submit". Confirmation screen. Owner emailed.
9. Drafts autosave (debounced 1s) server-side and in IndexedDB; restoring on reload is mandatory.

### 3.3 Owner views feedback
- Artifact left / comment list right (desktop); artifact with bottom sheet (mobile). Filter by reviewer. Each comment: reviewer name ("self-reported"), time, text, "original transcript" disclosure if edited, audio player (if retained), anchor badge, **Mark addressed** checkbox.
- Click comment → navigate iframe to `page_path`, re-anchor (§4.3), scroll into view, pulse highlight. If re-anchor fails → show stored screenshot with marker + "This part of the page has changed since the review."
- Owner can drag an auto-placed anchor to a new element (`anchor_source = owner_moved`).
- Controls: revoke invite, delete invite, delete review (typed confirmation).

## 4. Anchoring

### 4.1 Website anchor (jsonb)
```
{ kind: "dom", pageUrl, pagePath,
  textQuote: { exact, prefix, suffix },           // W3C TextQuoteSelector, ≤300 chars
  elementDescriptor: { tag, role, ariaLabel, imgAlt, imgSrcBasename, headingContext },
  cssPath, nthPath,                                 // secondary, never sole
  rectDoc: {x,y,w,h}, viewport: {w,h,dpr}, scroll: {x,y},
  point: {xPct,yPct} }                              // within element
{ kind: "viewport", pageUrl, pagePath, scroll, viewport, visibleTextSample }
{ kind: "screenshot", pagePath, imageKey, point:{xPct,yPct} }   // Screenshot mode
```
Screenshot reference: on submit, server requests screenshots via `ScreenshotService` (Phase A local Playwright; Phase B Browser Run) for each distinct `(pagePath, scrollY bucket)` used by comments (batched; skip if daily budget exhausted and record that).

### 4.2 PDF anchor
`{ kind: "pdf", page, textQuote?, rectPdf: {x,y,w,h} (PDF user-space units), point:{xPct,yPct} }`. Text selection when available, else pin.

### 4.3 Re-anchoring order
textQuote (exact+prefix/suffix fuzzy match, scoped near cssPath first) → cssPath/nthPath with descriptor check → rectDoc on same viewport width → stored screenshot. Implemented once in `packages/anchoring`, unit-tested with fixture DOMs including mutated versions.

## 5. Talk-through recording & AI anchors

### 5.1 Timeline capture (overlay.js, during recording)
- Every 1000 ms and on scroll-end/navigation: snapshot of **visible anchor candidates**: elements matching headings, p, li, img, figure, video, a, button, [role], section/article with visible text or alt; max 40 by visible area. Each: `{eid, tag, text(≤160), alt, rectViewport, cssPath}`. `eid` is stable per page load (WeakMap counter).
- Every tap: `{t, eid, fullAnchor}` (full §4.1 anchor computed immediately).
- Timestamps relative to recording start (shared clock: shell sends `rec:start` with `performance.now()` baseline; overlay reports deltas).
- Timeline sent to shell via postMessage, persisted with the recording.

### 5.2 Resolution (server, after transcription)
1. **Tap split (deterministic):** each tap at time t starts a new segment at the first word whose `start ≥ t − 0.3s`. Speech before first tap → segment 0.
2. **AI pass** on segments without a tap (and to sub-split long untapped segments): send `words` (indexed) + timeline snapshots overlapping each segment's time range. Model returns JSON:
   `[{ startWord, endWord, eid|null, confidence }]`.
3. **Validation (code, not model):** spans contiguous, non-overlapping, cover all words in order; joined words == original transcript (whitespace-normalized); every `eid` existed in a snapshot within the span's time window ±2s. Any failure → discard AI output for that segment, mark `ai_anchor_rejected` event, use viewport anchor.
4. `confidence < 0.6` or `eid null` → `viewport` anchor (snapshot nearest span midpoint).
5. Tap segments are never re-anchored by AI. Segments shorter than 3 words merge into the previous segment.
6. Comment `text` = span text with whitespace/caps cleanup only (no rewording). `transcript_original` = exact span.

Resolver prompt lives in `apps/web/lib/anchor-resolver/prompt.md`, versioned; resolver has a recorded-fixture test suite (≥15 cases: pointing language, "this section", topic shifts, no visual reference).

### 5.3 PDF talk-through
Same model: timeline = visible pages + text blocks (pdf.js text layer items grouped into lines) every second; taps produce pdf anchors.

## 6. Proxy (Cloudflare Worker) specifics
- **Path preservation is mandatory.** SPA routers (Next, Framer, React Router) read `location.pathname` and call `history.pushState('/about')`; if the proxied pathname differs from the origin's, routing breaks or throws a cross-origin SecurityError. So the proxied URL's path must equal the origin path:
  - **Pilot/production:** per-review subdomain on Jas's custom domain via a wildcard Workers route: `https://{rid}.view.{DOMAIN}/{originPath}`. Entry: `https://{rid}.view.{DOMAIN}/__enter?t={token}` sets a host-only, `Secure; HttpOnly; SameSite=None; Partitioned` cookie holding the token, then redirects to the origin path. Per-review hosts also isolate reviews from each other.
  - **Phase A (local) and before the domain exists:** single host (`localhost:8787`, tunnel hostname on phone, or `workers.dev`) with the same `__enter` cookie flow (one active review per browser at a time; acceptable for dev).
  - Requests without a valid cookie → 403 page "Open this from your review link."
- Token = base64url(JSON{rid, etld1, exp}) + HMAC-SHA256 (secret shared with app). TTL 6h; the app shell re-enters to refresh.
- overlay.js additionally wraps `history.pushState/replaceState` to normalize any absolute origin URL to the proxy host before calling the native method.
- Upstream fetch: resolve hostname via DoH, reject private/reserved ranges (v4+v6), manual redirect following (≤5), each hop re-validated and must stay https. 5 MB HTML cap, 10 s timeout. User-Agent identifies the service.
- Document rewriting (HTMLRewriter): inject `<base href="{origin}">` so relative assets load from origin; rewrite `<a href>` to same eTLD+1 → proxied URL; others → `target=_blank rel=noopener` marked external; remove `<meta http-equiv=CSP>`; inject `overlay.js` first in `<head>`.
- Response headers: drop `content-security-policy*`, `x-frame-options`, `set-cookie`, `strict-transport-security`; add `x-robots-tag: noindex`, `cache-control: private, no-store`, `referrer-policy: no-referrer`, a CSP `frame-ancestors` built from env `ALLOWED_APP_ORIGINS` (staging/prod origins + this project's Vercel preview pattern).
- overlay.js: patches `history.pushState/replaceState` + listens `popstate` to report SPA route changes; blocks `navigator.serviceWorker.register`; blocks form submit; intercepts clicks when in capture mode (`capture: true` listener + preventDefault/stopPropagation); reports `overlay:ready`, `nav`, `timeline`, `tap`, `error`. Accepts messages only from `APP_ORIGIN`.
- Known-limit doc: `docs/PLATFORM_SUPPORT.md` generated from gate results.
- Rate limits: per token 600 req/10 min; per IP 120 doc fetches/10 min.

## 7. Security checklist (each is a test)
- Reviewer token: 32 random bytes, only hash stored; invalid/revoked → 404 indistinguishable.
- Owner APIs enforce `owner_id = auth.uid()`; RLS policies + API checks; tests attempt cross-owner access.
- Reviewer APIs scope every query by `invite_id`; tests attempt cross-invite comment edit/delete.
- Submitted invites reject comment mutations.
- URL validator unit tests: `file:`, `javascript:`, `http:`, `localhost`, `127.0.0.1`, `[::1]`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fc00::/7`, decimal/octal IP encodings, DNS rebinding (resolve-then-connect pinned), redirect to private.
- Uploads: MIME sniff + `%PDF-` magic, size, page count; audio MIME allowlist (`audio/mp4`, `audio/webm`, `audio/mpeg`, `audio/wav`), ≤25 MB.
- No PII/content in URLs (except reviewer token), analytics, logs, or Sentry (scrubber).
- All private pages: `noindex`, `no-store`.
- Rate limits on: review create, invite create, upload, transcribe, resolve, health check — implemented as a Postgres-backed token-bucket table (no extra vendor).
- postMessage: strict origin checks both directions; schema-validated (zod).

## 8. Milestones & acceptance criteria

Each milestone = one or more task branches merged with `pnpm merge-task`. A milestone is done only when all its acceptance tests are automated and green in `pnpm verify` (except items marked *manual*, which go into `docs/MANUAL_CHECKS.md` for Jas). M0–M6 are Phase A and fully autonomous; M7 is Phase B and starts only when Jas says so.

**M0 — Scaffold & local toolchain**
- Monorepo, TS strict, ESLint/Prettier, Vitest, Playwright (projects: `chromium`, `webkit-iphone` = `devices['iPhone 14']`, `webkit-ipad`).
- Supabase migrations + RLS + seed; local dev via Supabase CLI.
- `pnpm setup`, `pnpm dev`, `pnpm dev:phone`, `pnpm verify`, `pnpm merge-task` (§0). Interfaces from D30 with `mock` implementations.
- `README.md` (setup, env, migrations, tests, deploy, security notes), `.env.example`.
- ✅ `pnpm verify` green on an empty-app smoke test in both browsers. ✅ `pnpm setup` re-run is a no-op.

**M1 — Proxy feasibility gate** (parallel with M2)
- Worker with token verification, SSRF guard, rewriting, overlay ready/tap/nav messages.
- Fixtures are served on localhost, which the SSRF guard blocks; allow them only via `ALLOW_FIXTURE_HOSTS` that is honored solely when `ENVIRONMENT=test` (unit test proves it's ignored otherwise).
- Local deterministic fixtures in `apps/proxy/fixtures/`: static site, SPA w/ client router, site with CSP+XFO, site with service worker, site with forms, site with animations/canvas. E2E tests run against fixtures (blocking CI).
- `pnpm gate` script: runs the live list in `docs/test-portfolios.json` through health check + Playwright (chromium + webkit-iphone): page renders, a scripted interaction (scroll + hover/click on a nav element) causes DOM change, tap produces an anchor, re-anchor succeeds after reload. Writes `docs/PLATFORM_SUPPORT.md` (table: url, platform fingerprint, live pass/fail per browser, failure reason). Runs nightly + manually; **non-blocking** for CI (external flakiness).
- ✅ Fixture e2e green. ✅ Gate report committed. ✅ Apply D3 rule; if below threshold, Screenshot mode is mandatory for failing platform fingerprints (auto-chosen at health check).

**M2 — PDF review end to end (typed comments)**
- Owner auth (magic link; Phase A email lands in the local inbox; dev-only sign-in shortcut per D31, with a test proving it is absent when `NODE_ENV=production`), create PDF review, invites, reviewer link, pdf.js viewer (zoom, pages, text layer), tap/select to anchor, typed comments, autosave + IndexedDB restore, submit w/ name/email, owner feedback view with navigate-to-anchor, revoke, delete.
- ✅ E2E: full happy path on chromium + webkit-iphone. ✅ Refresh mid-draft restores comments. ✅ Offline save queues and syncs. ✅ Revoked link 404s. ✅ Cross-owner and cross-invite access denied. ✅ Deleting review removes storage objects.

**M3 — Talk-through recording (PDF first)**
- Recorder (MediaRecorder; `audio/mp4` on Safari, `audio/webm` elsewhere), disclosure + consent, bar UI, IndexedDB buffer, upload, local whisper.cpp transcription (M3 starts with a spike confirming word-level timestamps on real iPhone `audio/mp4` recordings; switch to faster-whisper per D14 if needed), tap split, AI resolver + validator, split preview with "Looks good", edit/re-anchor/merge/delete, audio playback for owner, 90-day purge cron.
- `pnpm verify` mocks AI with recorded fixtures; optional `pnpm test:live-ai` runs the real local whisper + Ollama.
- Transcriber/LLM unavailable or slow (process down, >60 s): audio is kept, recording marked `pending`, reviewer sees "Your recording is saved — transcription is taking longer than usual; you can keep going or type", automatic retry with backoff.
- Resolver eval: `pnpm eval:anchors` runs the ≥15 fixture cases against the real model; ≥80% correct anchors required to adopt a model (D15). Result table committed to `docs/ANCHOR_EVAL.md`.
- ✅ Validator rejects any reworded/missing/duplicated span (property tests). ✅ Tap overrides AI. ✅ Permission denied → typed path offered. ✅ Transcription failure → retry, audio not lost, typed fallback. ✅ Purge job deletes expired audio. *Manual:* record on a real iPhone Safari and iPad.

**M4 — Website review (live + Screenshot mode)**
- Wire proxy into reviewer/owner UIs, multi-page navigation, capture-mode click suppression, website timeline capture, website anchors + re-anchoring, screenshot capture on submit, Screenshot mode UI with labels.
- ✅ Fixture e2e: talk-through on SPA fixture across 2 pages produces correctly anchored comments (mocked AI). ✅ Re-anchor after fixture DOM mutation falls back in the specified order. ✅ Screenshot-mode site is labelled to reviewer and owner. *Manual:* 3 live Framer/Webflow sites on real iPhone.

**M5 — Notifications, status, polish**
- Email to owner on submit (no artifact content; link only). Invite statuses per D20. Mark addressed. General note. Empty/loading/error states everywhere. Accessibility pass (keyboard, labels, focus, non-color comment markers) with axe in e2e.
- ✅ axe: zero serious/critical violations on key pages. ✅ Email sent in e2e (`Mailer.mock`; local inbox verified in a live-dev smoke test).

**M6 — Phase A wrap-up (local)**
- Privacy notice (Phase A wording: audio stays on this computer), takedown/contact page, rate limits verified, metrics SQL views for PRD §15 from `review_events` + tables, `docs/DEMO_SCRIPT.md` (how Jas runs an end-to-end review on her phone via `pnpm dev:phone`), `docs/PHASE_B_PLAN.md` (exact env vars, adapters to write, accounts to create).
- ✅ Load smoke: 10 concurrent simulated reviewers locally without errors. *Manual:* Jas completes a full review as reviewer on her iPhone through the tunnel.

**M7 — Phase B cloud pilot (starts only when Jas says so; needs her for account setup)**
- Jas completes `docs/SETUP_CHECKLIST.md` Phase B. Agent writes `cloud` adapters (Workers AI `Transcriber` + `AnchorResolver`, Browser Run `ScreenshotService`, Resend `Mailer`, subdomain `ProxyHost`), re-runs `pnpm eval:anchors` on the cloud model, moves to GitHub PRs + Actions + auto-merge, deploys staging, adds Supabase keep-alive, Sentry (optional). Privacy notice updated with the cloud provider's current data-use terms (verify and cite).
- ✅ Same acceptance suite green against staging. ✅ Load smoke: 20 concurrent reviewers on staging.

## 9. Out of scope (do not build)
Payments, marketplace, reviewer accounts/profiles, public pages, follow-up/version comparison, multi-reviewer synthesis, AI critique/summaries, annotated PDF export, OCR, native apps, extensions, analytics vendors, password auth.
