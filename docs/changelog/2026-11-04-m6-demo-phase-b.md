# M6: demo script, Phase B plan, Simulator check

## What and why
- **`docs/DEMO_SCRIPT.md`**: how Jas runs a full review on her phone with `pnpm dev:phone`:
  - start the stack, create a review, review on the phone (typed, talk-through, offline, submit), read the feedback, stop;
  - a troubleshooting table;
  - a quicker iOS Simulator route (`pnpm dev`, no tunnels).
- **`docs/PHASE_B_PLAN.md`**, for M7, which isn't started:
  - decisions Jas needs to make first;
  - accounts;
  - every environment variable for the app, Worker and Supabase;
  - the five `cloud` adapters and their pitfalls;
  - what works differently off the Mac (jobs, storage rewrite, upload size, keep-alive);
  - privacy notice changes, PR/CI process, order of work and expected cost.
  - Provider facts the plan depends on are marked **verify**, to be checked and cited in M7.
  - The plan recommends hosting reviewed sites on a **separate proxy domain** (`{rid}.{PROXY_DOMAIN}`) rather than SPEC §6's `{rid}.view.{DOMAIN}`. That changes origin isolation, so it's listed as decision B1 for Jas rather than changed.
- **Simulator check (Jas accepted Simulator-only checks for now):**
  - In iOS Simulator Safari (iPhone 17), a PDF reviewer link renders, and a real Framer portfolio is created as **Live** and renders through the proxy.
  - Interactive steps (taps, voice) can't be driven by the agent. They stay in `docs/MANUAL_CHECKS.md`, which now says the Simulator is acceptable.

## Acceptance items
- "`docs/DEMO_SCRIPT.md`, `docs/PHASE_B_PLAN.md`": done.
- *Manual:* "Jas completes a full review on her iPhone through the tunnel": partly done in the Simulator (rendering). The interactive part is still open for Jas.

## Screenshots
- `img/m6-simulator-pdf-iphone17.png`, `img/m6-simulator-framer-iphone17.png` (real iOS Safari in the Simulator, dev build; the round "N" is Next's dev-mode indicator).

## Known limitations
- No code change in this slice.
