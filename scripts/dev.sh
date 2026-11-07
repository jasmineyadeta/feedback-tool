#!/usr/bin/env bash
# pnpm dev — start everything locally (SPEC §0). Ctrl-C stops app processes; `pnpm dev:stop` stops all.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

APP_ORIGIN="${APP_ORIGIN:-http://localhost:3000}"
PROXY_ORIGIN="${PROXY_ORIGIN:-http://localhost:8787}"
PIDS="$RUN_DIR/dev.pids"
: >"$PIDS"

start_bg() { # name cmd...
  local name="$1"; shift
  nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
  echo "$name $!" >>"$PIDS"
}

echo "Starting local stack"
ensure_supabase
write_env_files "$APP_ORIGIN" "$PROXY_ORIGIN"

# Whisper server
if port_in_use 8178; then c_ok "Whisper server already on :8178"; else
  start_bg whisper whisper-server -m "$MODELS_DIR/ggml-$WHISPER_MODEL.bin" --host 127.0.0.1 --port 8178 -t 6 --convert
  c_ok "Whisper server starting on :8178 (model $WHISPER_MODEL)"
fi

# Ollama
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null; then c_ok "Ollama already running"; else
  start_bg ollama ollama serve
  c_ok "Ollama starting on :11434"
fi

# Overlay bundle, proxy, app
pnpm --filter @ft/overlay build >/dev/null
if [ -d apps/proxy/src ]; then
  start_bg proxy pnpm --filter @ft/proxy dev
  c_ok "Proxy (wrangler dev) starting on :8787"
fi
start_bg web pnpm --filter @ft/web dev
c_ok "App (next dev) starting on :3000"

# In-process jobs scheduler (audio purge etc.) — runs hourly.
start_bg jobs bash -c 'while true; do pnpm --filter @ft/web jobs:run; sleep 3600; done'

wait_for_url http://localhost:3000/api/health 90 || c_warn "App is slow to start — see $LOG_DIR/web.log"

cat <<EOF

  App:           $APP_ORIGIN
  Proxy:         $PROXY_ORIGIN
  Email inbox:   $(sb_env MAILPIT_URL)
  Supabase:      $(sb_env STUDIO_URL)  (database UI)
  Logs:          $LOG_DIR/*.log

  Dev sign-in:   open $APP_ORIGIN/sign-in and use "Sign in as Jas (dev only)".
  Stop:          Ctrl-C stops the app; pnpm dev:stop stops everything incl. Supabase.
EOF

trap 'echo; echo "Stopping app processes…"; bash "$ROOT/scripts/dev-stop.sh" --keep-supabase; exit 0' INT TERM
wait
