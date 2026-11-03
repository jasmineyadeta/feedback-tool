#!/usr/bin/env bash
# pnpm verify — the merge gate (D24). Do not weaken this script to make it pass.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
export MOCK_AI=1

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

step "Secrets scan (gitleaks)"
gitleaks git --no-banner --redact --log-level warn .
# Also scan uncommitted, non-ignored files.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git ls-files -co --exclude-standard -z | xargs -0 -I{} rsync -R "{}" "$tmp/" 2>/dev/null || true
gitleaks dir --no-banner --redact --log-level warn --config .gitleaks.toml "$tmp"

step "Format check"
pnpm exec prettier --check . --log-level warn

step "Typecheck"
pnpm --filter @ft/overlay build >/dev/null
pnpm typecheck

step "Lint"
pnpm lint

step "Unit tests"
pnpm test

step "Database tests (local Supabase)"
ensure_supabase
supabase migration up >/dev/null
pnpm test:db

step "Build"
pnpm build

step "E2E (chromium + webkit-iphone)"
pnpm test:e2e

printf '\n\033[32m✔ verify green\033[0m\n'
mkdir -p "$RUN_DIR" && git rev-parse HEAD >"$RUN_DIR/verify-ok" && git diff HEAD --stat | tail -1 >>"$RUN_DIR/verify-ok"
