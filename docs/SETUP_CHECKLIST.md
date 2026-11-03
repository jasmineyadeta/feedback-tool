# Setup (Jas) — copy/paste guide

## Phase A — local POC: ~15 minutes, no accounts, $0

**Open Terminal:** press `⌘ Space`, type `Terminal`, press Return. Paste each block below, press Return, and wait for it to finish before the next one.

### 1. Check your Mac
```bash
uname -m; sysctl -n hw.memsize | awk '{printf "%.0f GB RAM\n", $1/1073741824}'; df -h ~ | tail -1 | awk '{print $4 " free disk"}'
```
You want `arm64` (Apple Silicon), 16 GB+ RAM, 20 GB+ free. Less still works, just slower with smaller AI models.

### 2. Install Homebrew (Mac package installer)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
It asks for your Mac password (nothing appears as you type — that's normal) and asks you to press Return. It may also install Apple's developer tools; let it. Then make `brew` available:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)" && brew --version
```

### 3. Install Docker Desktop and Claude Code
```bash
brew install --cask docker-desktop && curl -fsSL https://claude.ai/install.sh | bash
```
Then open Docker once and finish its setup (accept the terms; you can **skip** signing in — no Docker account needed):
```bash
open -a Docker
```
Wait until the Docker whale icon in the menu bar stops animating.

### 4. Set up the project folder
Assumes the zip is in your Downloads folder as `build-pack.zip`.
```bash
mkdir -p ~/Projects && cd ~/Projects && unzip -o ~/Downloads/build-pack.zip && mv build-pack feedback-tool && cd feedback-tool
git config --global user.name "Jas" && git config --global user.email "jasmine.ai.experiments@gmail.com"
git init -b main && git add -A && git commit -m "Build pack"
```

### 5. Start the build
Open a new Terminal window first (so the `claude` command is found), then:
```bash
cd ~/Projects/feedback-tool && caffeinate -i claude "$(cat KICKOFF_PROMPT.md)"
```
- The first time, Claude Code opens your browser to sign in with your Claude account.
- `caffeinate -i` keeps your Mac from sleeping while it works. Keep the laptop plugged in and the Terminal window open (closing the lid is fine on power only if your Mac is set to not sleep).
- The bundled `.claude/settings.json` pre-approves routine commands. If it asks about something else, approve it if it makes sense; it will never ask for `sudo`.

### 6. Check in occasionally
Open these in the project folder (`open ~/Projects/feedback-tool/docs`):
- `PROGRESS.md` — what's done
- `NEEDS_HUMAN.md` — anything blocked, with options and a recommendation
- `MANUAL_CHECKS.md` — things to try on your iPhone

To resume after closing Terminal:
```bash
cd ~/Projects/feedback-tool && caffeinate -i claude --continue
```
To try it on your iPhone once M2+ is done (prints a link + QR code):
```bash
cd ~/Projects/feedback-tool && pnpm dev:phone
```

Optional backup to GitHub: create an empty private repo at https://github.com/new, then:
```bash
cd ~/Projects/feedback-tool && git remote add origin https://github.com/YOUR-USERNAME/feedback-tool.git && git push -u origin main
```

## Phase B — cloud pilot (later, when you want real reviewers)

Done together: Claude walks you through each sign-up in the browser; you handle verification steps. ~30–45 minutes.

| # | Service | Sign-up | Purpose | Cost |
|---|---|---|---|---|
| 1 | GitHub | https://github.com/signup | PRs, CI, auto-merge | $0 |
| 2 | Supabase | https://supabase.com/dashboard/sign-up | Hosted DB/storage/auth | $0 |
| 3 | Vercel | https://vercel.com/signup | Host the app (Hobby is non-commercial — upgrade before charging) | $0 |
| 4 | Cloudflare | https://dash.cloudflare.com/sign-up | Proxy Worker, screenshots, speech + AI | $0 |
| 5 | Domain | https://domains.cloudflare.com | Per-review proxy subdomains + email sending | ~$10/yr |
| 6 | Resend | https://resend.com/signup | Email | $0 |
| 7 | Sentry (optional) | https://sentry.io/signup | Error monitoring | $0 |

The agent's `docs/PHASE_B_PLAN.md` (written in M6) will list exact env vars and steps.
