#!/usr/bin/env bash
# Starts the production build on test ports for Playwright. Called by playwright.config.ts.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
ensure_supabase >/dev/null
export NODE_ENV=production MOCK_AI=1 TRANSCRIBER=mock ANCHOR_RESOLVER=mock SCREENSHOT=mock MAILER=mock PROXY_HOST=local
export APP_ORIGIN=http://localhost:3100 PROXY_ORIGIN=http://localhost:8788
export SUPABASE_URL="$(sb_env API_URL)" SUPABASE_ANON_KEY="$(sb_env ANON_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(sb_env SERVICE_ROLE_KEY)"
export PROXY_TOKEN_SECRET="e2e-$(proxy_secret)" MAIL_OUTBOX_DIR="$RUN_DIR/e2e-outbox"
mkdir -p "$MAIL_OUTBOX_DIR"
if [ ! -f apps/web/.next/BUILD_ID ]; then pnpm --filter @ft/web build; fi
exec pnpm --filter @ft/web exec next start --port 3100
