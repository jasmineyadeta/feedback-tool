# Contextual Feedback (Phase A — local POC)

Reviewers open a link, talk through a portfolio site or resume PDF, and tap to point. Everything runs on this Mac: no accounts, $0. Product context: `docs/PRD.md`; build spec: `docs/SPEC.md`; decisions: `docs/DECISIONS.md`.

## Setup

Requires Homebrew and Docker Desktop (running). Then:

```bash
pnpm setup      # installs tools via Homebrew, models, browsers; starts Supabase; migrates + seeds. Safe to re-run.
pnpm dev        # Supabase, whisper server, Ollama, proxy, app. Prints URLs (app, email inbox, DB UI).
pnpm dev:phone  # same, plus free cloudflared quick tunnels + a QR code for your iPhone
pnpm dev:stop   # stops everything, including Supabase containers
```

Dev sign-in: on `/sign-in`, "Sign in as Jas (dev only)" exists only when `NODE_ENV=development`. Magic-link emails land in the local inbox (Mailpit, URL printed by `pnpm dev`).

## Env

`pnpm setup`/`pnpm dev` write `apps/web/.env.local` and `apps/proxy/.dev.vars` from `supabase status`. Every variable is documented in `.env.example`. External services sit behind D30 interfaces (`Transcriber`, `AnchorResolver`, `ScreenshotService`, `Mailer`, `ProxyHost`) with `local` and `mock` implementations chosen by env; `MOCK_AI=1` forces mock AI.

## Layout

- `apps/web`: Next.js app (owner + reviewer UIs, API routes). Server code only in `app/api/**` and `lib/server/**`.
- `apps/proxy`: Cloudflare Worker document proxy, run locally with `wrangler dev` (no login).
- `packages/shared`: zod schemas (anchors, timeline, postMessage protocol), D30 interfaces, limits.
- `packages/anchoring`: anchor serialization + re-anchoring.
- `packages/overlay`: script injected into proxied pages (IIFE bundle).
- `supabase/`: config, forward-only migrations, email templates.

## Migrations

Add a new file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`); never edit a merged one. Apply with `supabase migration up`, or `supabase db reset` to rebuild locally.

## Tests

- `pnpm verify`: the merge gate. Runs gitleaks, prettier, typecheck, lint, unit, DB (RLS) tests, build, and e2e (chromium + webkit-iphone) with `MOCK_AI=1`.
- `pnpm test`, `pnpm test:db`, `pnpm test:e2e`: individual stages.
- `pnpm gate`: live proxy feasibility run against `docs/test-portfolios.json` (non-blocking).
- `pnpm eval:anchors`, `pnpm test:live-ai`: real local whisper + Ollama.

## Git workflow

Branch `m{N}/{slug}` → `pnpm merge-task` (refuses unless the tree is clean and verify is green, then squash-merges to `main`). See `CLAUDE.md`.

## Deploy

None in Phase A. Phase B (cloud pilot) is described in `docs/PHASE_B_PLAN.md` (written in M6).

## Security notes

- Proxied content never shares the app origin (app :3000, proxy :8787). Communication is postMessage only, with origin checks and zod validation.
- Reviewer tokens: 32 random bytes; only the SHA-256 hash is stored.
- RLS on every table; reviewer access goes through server routes scoped by `invite_id`.
- Owners can't modify reviewer text (column-level grants); comments are visible to owners only after submit.
- Storage buckets are private; access is via short-lived signed URLs only.
- No artifact content, reviewer emails, or full URLs in logs or `review_events`.
