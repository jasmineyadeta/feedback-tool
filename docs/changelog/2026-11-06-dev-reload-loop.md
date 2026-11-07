# Fix: `pnpm dev` page reload loop

**What:** In `pnpm dev`, pages reloaded about 11 times a second and the Next.js "N" indicator flashed constantly (Jas, during the local demo).

**Why:** `scripts/dev.sh` wrote the app's log to `.run/web.log`, inside the repo. Turbopack watches the whole workspace, so each logged request triggered a rebuild ("Compiled in 1ms" plus an HMR `restart`), which reloaded the page, which logged another request, and so on. The proxy log would have done the same while reviewing a site.

**Fix:** dev, setup and tunnel logs now go to `~/.cache/feedback-tool/logs` (`FT_LOG_DIR` overrides it), next to the models cache. Bookkeeping files (pids, the proxy secret, `verify-ok`) stay in `.run/`. `pnpm dev` prints the log folder.

**Checked:** restarted `pnpm dev` and loaded `/sign-in` in headless Chromium: one page load, no HMR restarts, and the app log stayed still.

- No UI change (no screenshots), no new dependencies, no new manual checks.
- Known limitation: anything else that writes inside the repo during `pnpm dev` would cause the same loop.
