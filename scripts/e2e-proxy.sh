#!/usr/bin/env bash
# Starts fixture sites (4601-4606) + the proxy in test env on :8788. Called by playwright.config.ts.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
node apps/proxy/fixtures/server.mjs &
FIX=$!
trap 'kill $FIX 2>/dev/null' EXIT
pnpm --filter @ft/overlay build >/dev/null
cd apps/proxy && node scripts-gen-overlay.mjs
# Wrangler prefers .dev.vars.test for --env test (the dev .dev.vars would otherwise override vars).
cat >.dev.vars.test <<VARS
PROXY_TOKEN_SECRET=e2e-$(proxy_secret)
ENVIRONMENT=test
ALLOW_FIXTURE_HOSTS=localhost:4601,localhost:4602,localhost:4603,localhost:4604,localhost:4605,localhost:4606
APP_ORIGIN=http://localhost:3100
ALLOWED_APP_ORIGINS=http://localhost:3100
VARS
exec pnpm exec wrangler dev --env test --port 8788 --ip 127.0.0.1 --log-level warn
