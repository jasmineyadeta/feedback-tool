#!/usr/bin/env bash
# pnpm dev:phone — pnpm dev + two cloudflared quick tunnels (no login, D29/D31).
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

PIDS="$RUN_DIR/phone.pids"
: >"$PIDS"

tunnel() { # name port -> prints https URL
  local name="$1" port="$2" log="$RUN_DIR/tunnel-$1.log"
  nohup cloudflared tunnel --url "http://localhost:$port" --no-autoupdate >"$log" 2>&1 &
  echo "tunnel-$name $!" >>"$PIDS"
  for _ in $(seq 60); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)"
    if [ -n "$url" ]; then echo "$url"; return 0; fi
    sleep 1
  done
  c_err "Tunnel for $name didn't come up — see $log"; return 1
}

echo "Opening quick tunnels (free, no account)…"
APP_TUNNEL="$(tunnel app 3000)"
PROXY_TUNNEL="$(tunnel proxy 8787)"
c_ok "App tunnel:   $APP_TUNNEL"
c_ok "Proxy tunnel: $PROXY_TUNNEL"

echo
echo "Scan this on your iPhone to open the app:"
pnpm exec qrcode-terminal "$APP_TUNNEL" 2>/dev/null || echo "  $APP_TUNNEL"
echo

APP_ORIGIN="$APP_TUNNEL" PROXY_ORIGIN="$PROXY_TUNNEL" exec bash "$ROOT/scripts/dev.sh"
