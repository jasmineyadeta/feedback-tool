/**
 * Idempotent seed: creates the dev owner account used by the dev-only sign-in shortcut (D31).
 * Reads Supabase credentials from apps/web/.env.local (written by scripts/lib.sh).
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export const DEV_OWNER_EMAIL = 'jas@local.test';

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

async function main() {
  const env = { ...loadEnv('apps/web/.env.local'), ...process.env };
  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  if (data.users.some((u) => u.email === DEV_OWNER_EMAIL)) return;
  const { error: e2 } = await admin.auth.admin.createUser({
    email: DEV_OWNER_EMAIL,
    email_confirm: true,
    user_metadata: { name: 'Jas' },
  });
  if (e2) throw e2;
}

main().catch((e) => {
  console.error('seed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
