# CLAUDE.md — Operating rules for the coding agent

You are building the Contextual Feedback MVP autonomously, **locally on Jas's Mac (Phase A)**. Read in this order before any work: `docs/DECISIONS.md` → `docs/SPEC.md` (start with §0) → `docs/PRD.md` (product context). Precedence: DECISIONS > SPEC > PRD.

## Working loop
1. Pick the next unchecked item in `docs/PROGRESS.md` (create it from SPEC §8 milestones M0–M6 on first run: one checkbox per acceptance criterion). Do not start M7.
2. Create a branch `m{N}/{short-slug}` from latest `main`.
3. Implement the smallest coherent slice (target ≤ ~600 changed lines excluding generated files/lockfiles). Write tests with the code.
4. Run `pnpm verify`. Fix until green.
5. Write `docs/changelog/{date}-{slug}.md`: what/why, acceptance items covered, Playwright screenshots (chromium + webkit-iphone) saved under `docs/changelog/img/`, manual checks added to `docs/MANUAL_CHECKS.md`, known limitations.
6. `pnpm merge-task`. Tick `docs/PROGRESS.md`. If a GitHub remote named `origin` exists, `git push origin main` (never force-push). Continue.

## Usage efficiency
- Jas is on a Claude subscription with usage limits. Be frugal: don't re-read the full PRD/SPEC every task — read only the SPEC sections relevant to the current item. Prefer targeted file reads and searches over dumping large files or logs.
- Keep `docs/PROGRESS.md` current after every merge so work can resume cleanly after a usage-limit pause or a new session (`claude --continue`).
- Never set or use an `ANTHROPIC_API_KEY`.

## Merge guardrails (D24)
- Only `pnpm merge-task` merges to `main`, and only on green `pnpm verify`.
- **Never** delete, skip (`.skip`, `test.fixme`), or weaken an existing test, lower a coverage/axe threshold, or edit `pnpm verify`/`merge-task` to make it pass. If you believe a test is wrong, leave the branch unmerged and add it to `docs/NEEDS_HUMAN.md`.
- Never commit secrets. `.env*` except `.env.example` is gitignored; `gitleaks` runs inside `pnpm verify`.
- Migrations are forward-only; never edit a merged migration.
- Justify each new runtime dependency in the changelog entry.

## Cost, accounts & local runtime (D29–D32)
- Phase A needs **no accounts and costs $0**. Never add a paid service, a sign-up, or a cloud API. Never run `wrangler login`, `supabase login`, or deploy anything.
- All external dependencies go through the D30 interfaces with `local` and `mock` implementations; selection by env. Don't write `cloud` adapters until M7.
- `MOCK_AI=1` is the default in `pnpm verify`; real local whisper/Ollama only in `pnpm test:live-ai`, `pnpm eval:anchors`, and `pnpm dev`.
- Install tools only via Homebrew, pnpm, or pip in a project venv; never `sudo`, never modify shell profiles without printing what changed.
- Keep the machine usable: Docker containers and model servers are started by `pnpm dev` and stopped by `pnpm dev:stop`.

## Stop conditions — add an entry to `docs/NEEDS_HUMAN.md` and move to other unblocked work
- A decision in DECISIONS.md appears impossible or wrong.
- Anything needs an account, payment, or a secret Jas must create.
- A change to the security model (origin isolation, token scheme, RLS strategy, data retention).
- The machine can't run a required component even with the smallest model (D32).
- Two consecutive attempts to fix the same failing check fail.
Each entry: what's blocked, options with tradeoffs, your recommendation. Do not wait idle.

## Non-negotiables (from PRD)
- Do not fake a live site; Screenshot mode must always be labelled.
- AI never rewrites the reviewer's words; the validator in SPEC §5.2 is mandatory.
- Secrets server-side only. Validate URLs/uploads on the server.
- No artifact content, reviewer emails, or full URLs in logs or analytics.
- Comments must never be silently lost: IndexedDB buffer until server ACK.
- Mobile Safari is a first-class target; every UI change includes webkit-iphone screenshots.
- Dev-only conveniences (e.g. sign-in shortcut) must be impossible in production builds, with a test proving it.

## Conventions
- TypeScript strict; zod at every boundary (API, postMessage, LLM output).
- Server code in `apps/web/app/api/**` and `apps/web/lib/server/**` only; never import server modules into client components.
- Interfaces: `Transcriber`, `AnchorResolver`, `ScreenshotService`, `Mailer`, `ProxyHost`.
- UI: Tailwind + Radix primitives. Calm, professional, mostly neutral palette; artifact takes most of the screen.
- Copy: plain, short, no jargon. Error messages say what happened and what to do next.
