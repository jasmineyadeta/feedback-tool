# Phase B plan: cloud pilot (M7)

Written at the end of Phase A (2026-11-04). **Nothing here starts until Jas says so.** Phase B is configuration plus small `cloud` adapters (D30), not a rebuild. Every item marked **verify** depends on a provider's current docs or pricing, and must be checked and cited when M7 starts. This plan was written offline and doesn't claim them as fact.

## 1. Decisions Jas needs to make before M7

| # | Decision | Options | Recommendation |
|---|---|---|---|
| B1 | **Domain for reviewed sites.** SPEC §6 puts each review on `{rid}.view.{DOMAIN}`, under the same domain as the app. | (a) As specced. A wildcard two levels deep is not covered by Cloudflare's free certificate (**verify**; Advanced Certificate Manager is paid). (b) `{rid}.{PROXY_DOMAIN}` on a **second, separate domain** (about $10/yr). Covered by the free wildcard certificate, and the candidate's site can't set cookies that the app's domain would read. | **Decided: (b)** (Jas, 2026-11-06). Buy two domains at M7: the app domain and a separate proxy domain. |
| B2 | Who gets the takedown and privacy emails (`CONTACT_EMAIL`). | Personal address, or a new alias on the domain. | An alias on the domain, forwarded with Cloudflare Email Routing (free). |
| B3 | Speech-to-text and AI provider. | Workers AI (D14/D15), or Groq as backup. | Workers AI. Re-run `pnpm eval:anchors` first; it must reach ≥80%. |
| B4 | Error monitoring. | Sentry (optional), or none. | None for the first 20 candidates. Server logs are enough. |

## 2. Accounts (from `docs/SETUP_CHECKLIST.md`, done together)
1. **GitHub.** The repo already exists. Add branch protection on `main` (PR + green checks) when Actions arrive.
2. **Supabase** (free): one project for staging, a second for production later.
3. **Vercel** (Hobby): import the repo, root `apps/web`. Hobby is non-commercial (D27), so move to paid before charging.
4. **Cloudflare** (free): Workers, Workers AI and Browser Run (**verify** the free-tier limits).
5. **Domain(s)** via Cloudflare Registrar: app domain, plus a proxy domain if B1 = (b).
6. **Resend** (free): verify the sending domain (SPF/DKIM records in Cloudflare DNS).
7. **Sentry**: only if B4 says so.

Jas creates every secret. The agent never sees a password and never runs `wrangler login` or `supabase login` on Jas's behalf.

## 3. Environment variables

### App (Vercel project settings)
| Variable | Value | Notes |
|---|---|---|
| `APP_ORIGIN` | `https://app.{DOMAIN}` | |
| `PROXY_ORIGIN` | `https://{PROXY_DOMAIN}` | The per-review host is derived from it (see §4, `ProxyHost.cloud`). |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project settings | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings | Server only. Never `NEXT_PUBLIC_`. |
| `PROXY_TOKEN_SECRET` | 32+ random bytes | Must match the Worker secret. |
| `TRANSCRIBER`, `ANCHOR_RESOLVER`, `SCREENSHOT`, `MAILER` | `cloud` | Add `cloud` to the env enum (`lib/server/env.ts`). |
| `PROXY_HOST` | `cloud` | |
| `MOCK_AI` | `0` | |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | Cloudflare API token scoped to Workers AI only | New. |
| `CF_BROWSER_TOKEN` | Token scoped to Browser Run only | New. Could share one token with the line above, but separate tokens limit damage if one leaks. |
| `ANCHOR_MODEL`, `WHISPER_MODEL` | Workers AI model ids | Chosen in M7 by `pnpm eval:anchors` (**verify** current model list and JSON-schema support). |
| `RESEND_API_KEY`, `MAIL_FROM` | Resend | New. |
| `CONTACT_EMAIL` | from B2 | Already supported. |
| `CRON_SECRET` | random | New. Protects the jobs endpoint (§5). |

### Proxy Worker (`wrangler secret put` / `[env.production.vars]`)
| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production`. `ALLOW_FIXTURE_HOSTS` is ignored unless this is `test` (already unit-tested). |
| `PROXY_TOKEN_SECRET` | same as the app |
| `APP_ORIGIN`, `ALLOWED_APP_ORIGINS` | `https://app.{DOMAIN}` |
| `PUBLIC_ORIGIN` | the proxy domain |
| Route | `*.{PROXY_DOMAIN}/*` → `ft-proxy` (wildcard DNS `*` proxied through Cloudflare) |

### Supabase project
- Run the migrations: `supabase db push` with Jas's project ref. Forward-only; the same files as Phase A.
- Storage buckets `pdfs`, `audio`, `screenshots`, all private. Created by the migration.
- Auth:
  - Site URL `https://app.{DOMAIN}`; redirect URL `https://app.{DOMAIN}/auth/confirm`.
  - Custom SMTP through Resend, because the built-in sender is heavily rate limited (**verify**).
  - Disable password sign-in.

## 4. Adapters to write (each with a unit test against recorded responses and a `live` test)

| Interface | `cloud` implementation | Watch out for |
|---|---|---|
| `Transcriber` | Workers AI Whisper over REST | **Must return word-level start/end** (SPEC §5): **verify** the model's response shape. Normalise to `TranscriptWord[]`. Phase A converts to 16 kHz WAV with ffmpeg, which isn't available on Vercel: send the browser's webm/mp4 if the API accepts it (**verify**), otherwise convert in the Worker. |
| `AnchorResolver` | Workers AI LLM with JSON-schema output | Same prompt and the same validator (SPEC §5.2, mandatory). Pass `pnpm eval:anchors` at ≥80% before switching. |
| `ScreenshotService` | Cloudflare Browser Run | `capture` (full page, 6000 px cap) and `healthCheck` (load an app page that frames the proxy, wait for `overlay:ready`). The local version uses `playwright-core`, which can't run on Vercel. |
| `Mailer` | Resend REST | Link-only email (already built). Keep `ownerEmail` unchanged. |
| `ProxyHost` | `https://{rid}.{PROXY_DOMAIN}/__enter?t=…` | Per-review host (D17). Cookie `Secure; HttpOnly; SameSite=None; Partitioned`, already specified in SPEC §6. |

Selection stays in `apps/web/lib/server/adapters/index.ts`. `mock` stays the default in `pnpm verify`.

## 5. Things that work differently off the Mac
- **Background jobs.** `pnpm dev` runs `jobs:run` hourly in a shell loop (retry transcriptions, purge 90-day audio). In the cloud this becomes a protected route `POST /api/jobs` (checks `CRON_SECRET`), called hourly by a Cloudflare Worker Cron Trigger. Vercel Hobby crons are limited (**verify**).
- **After-response work** (`after()` for transcription and submit screenshots) must finish within Vercel's function time limit (**verify**). If transcription is slow, the jobs retry already covers it: the recording stays `pending` and is retried with backoff.
- **Storage through the app (`/sb/*` rewrite, D31)** was only for the phone tunnel. In the cloud, `viaApp()` should return Supabase's own signed URLs. PDF uploads (≤15 MB) must go straight to Supabase, not through a Vercel function (body size limit, **verify**).
- **Rate limits** use the Postgres token bucket. IPs come from `x-forwarded-for` set by Vercel. Check the magic-link limit still sees real client IPs.
- **Supabase free projects pause after 7 days idle** (D27). The hourly jobs call keeps it awake; add a test that the endpoint touches the database.
- **Platform gate.** Re-run `pnpm gate` against the real sites from `docs/test-portfolios.json` through the cloud proxy, and update `platform-policy.json` if a platform must use Screenshot mode.

## 6. Privacy notice changes (required before any real reviewer)
- Replace "runs on one computer" and "audio stays on this computer" with the provider's real terms:
  - who processes audio and text (Cloudflare Workers AI);
  - whether they keep or train on it (**verify and cite** their current data-use terms, per SPEC M7);
  - where data is stored (Supabase region).
- Update the consent sheet's second bullet (`talk-through.tsx`) to match. Tests check the wording, so update them in the same PR.

## 7. Process changes
- Move from local `pnpm merge-task` to GitHub PRs:
  - an Actions workflow runs `pnpm verify`, with Supabase CLI in Docker as in Phase A;
  - auto-merge on green.
- Staging deploys on merge. Jas promotes to production (D25).
- Same acceptance suite against staging. Load smoke at **20** concurrent reviewers (SPEC M7): point `e2e/load.spec.ts` at staging with `REVIEWERS=20`.

## 8. Rough order for M7 (each one PR)
1. Jas: accounts and domains (§2). Agent: `cloud` env enum and config validation.
2. `Mailer.cloud` + Supabase SMTP: sign-in works on staging.
3. `ProxyHost.cloud` + Worker deploy on the proxy domain: live sites work on staging.
4. `ScreenshotService.cloud`: health check and Screenshot mode work.
5. `Transcriber.cloud` + `AnchorResolver.cloud` + eval: talk-through works.
6. Jobs endpoint + cron, keep-alive.
7. Privacy notice wording, then the acceptance suite and the 20-reviewer load smoke on staging.

## 9. Expected cost
- Domains: about $10–20/yr (one or two).
- Everything else: $0 on free tiers at pilot scale (20+ candidates, D26). **Verify** the Workers AI and Browser Run free limits against about 20 reviews × 3 reviewers × 5 minutes of audio.
