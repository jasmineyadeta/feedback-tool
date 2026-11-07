#!/usr/bin/env bash
# pnpm setup — idempotent local toolchain setup (SPEC §0). Never uses sudo.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

echo "Setting up the feedback tool on this Mac"
echo

if ! command -v brew >/dev/null; then
  c_err "Homebrew isn't installed. Follow step 2 of docs/SETUP_CHECKLIST.md, then rerun pnpm setup."
  exit 1
fi
c_ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"

# --- Homebrew packages
brew_pkg() { # formula [binary]
  local f="$1" bin="${2:-}"
  if brew list --formula "${f##*/}" >/dev/null 2>&1; then c_ok "$f"; return; fi
  if [ -n "$bin" ] && command -v "$bin" >/dev/null; then c_ok "$f (found $bin)"; return; fi
  c_do "Installing ${f}…"
  brew install "$f" >/dev/null && c_ok "$f installed"
}
brew tap supabase/tap >/dev/null 2>&1 || true
brew_pkg node@22
brew_pkg pnpm
brew_pkg supabase/tap/supabase supabase
brew_pkg whisper-cpp whisper-server
brew_pkg ffmpeg
brew_pkg ollama
brew_pkg cloudflared
brew_pkg gitleaks

# --- JS deps + browsers
lock_sha="$(shasum -a 256 pnpm-lock.yaml | cut -d' ' -f1)"
if [ -d node_modules ] && [ "$(cat "$RUN_DIR/lock.sha" 2>/dev/null)" = "$lock_sha" ]; then
  c_ok "pnpm dependencies"
else
  c_do "Installing pnpm dependencies…"
  pnpm install --frozen-lockfile >/dev/null
  echo "$lock_sha" >"$RUN_DIR/lock.sha"
  c_ok "pnpm dependencies installed"
fi
pw_cache="$HOME/Library/Caches/ms-playwright"
if ls -d "$pw_cache"/chromium-* "$pw_cache"/webkit-* >/dev/null 2>&1 && \
   [ "$(cat "$RUN_DIR/playwright.ver" 2>/dev/null)" = "$(pnpm exec playwright --version)" ]; then
  c_ok "Playwright chromium + webkit"
else
  c_do "Installing Playwright browsers…"
  pnpm exec playwright install chromium webkit >/dev/null
  pnpm exec playwright --version >"$RUN_DIR/playwright.ver"
  c_ok "Playwright chromium + webkit installed"
fi

# --- Whisper model
mkdir -p "$MODELS_DIR"
wm="$MODELS_DIR/ggml-$WHISPER_MODEL.bin"
if [ -s "$wm" ]; then c_ok "Whisper model $WHISPER_MODEL"; else
  c_do "Downloading Whisper model $WHISPER_MODEL (~1.6 GB)…"
  curl -fsSL -o "$wm.part" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$WHISPER_MODEL.bin"
  mv "$wm.part" "$wm"
  c_ok "Whisper model downloaded"
fi

# --- Ollama model
anchor_model="$(cat "$RUN_DIR/anchor-model" 2>/dev/null || echo "$ANCHOR_MODEL_DEFAULT")"
started_ollama=0
if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null; then
  nohup ollama serve >"$LOG_DIR/ollama.log" 2>&1 &
  echo $! >"$RUN_DIR/ollama-setup.pid"; started_ollama=1
  wait_for_url http://127.0.0.1:11434/api/tags 30 || { c_err "Ollama didn't start — see $LOG_DIR/ollama.log"; exit 1; }
fi
if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$anchor_model"; then c_ok "Ollama model $anchor_model"; else
  c_do "Pulling Ollama model $anchor_model (~9 GB)…"
  ollama pull "$anchor_model" >/dev/null && c_ok "Ollama model pulled"
fi
if [ "$started_ollama" = 1 ]; then kill "$(cat "$RUN_DIR/ollama-setup.pid")" 2>/dev/null || true; rm -f "$RUN_DIR/ollama-setup.pid"; fi

# --- Supabase + migrations + seed
ensure_supabase
if supabase migration up >"$LOG_DIR/migrate.log" 2>&1; then c_ok "Migrations up to date"; else
  c_err "Migration failed — see $LOG_DIR/migrate.log"; exit 1; fi
write_env_files
c_ok "Env files written (apps/web/.env.local, apps/proxy/.dev.vars)"
pnpm exec tsx scripts/seed.ts && c_ok "Seed data (dev owner jas@local.test)"

echo
echo "Setup complete. Next: pnpm dev"
