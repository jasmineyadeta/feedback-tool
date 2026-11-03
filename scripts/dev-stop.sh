#!/usr/bin/env bash
# pnpm dev:stop — stop everything pnpm dev / dev:phone started, plus Supabase containers.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

kill_tree() {
  local pid="$1"
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

for f in "$RUN_DIR/dev.pids" "$RUN_DIR/phone.pids"; do
  [ -f "$f" ] || continue
  while read -r name pid; do
    [ -n "${pid:-}" ] || continue
    if kill -0 "$pid" 2>/dev/null; then kill_tree "$pid"; c_ok "Stopped $name"; fi
  done <"$f"
  rm -f "$f"
done

if [ "${1:-}" != "--keep-supabase" ]; then
  if supabase_running; then supabase stop >/dev/null 2>&1 && c_ok "Stopped Supabase"; fi
fi
