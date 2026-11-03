import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

function status(): Record<string, string> {
  const out = execSync('supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

let cached: Record<string, string> | null = null;
export function sbEnv() {
  if (!cached) {
    const s = status();
    cached = { url: s.API_URL!, anon: s.ANON_KEY!, service: s.SERVICE_ROLE_KEY! };
  }
  return cached as { url: string; anon: string; service: string };
}

export function adminClient(): SupabaseClient {
  const e = sbEnv();
  return createClient(e.url, e.service, { auth: { persistSession: false } });
}
export function anonClient(): SupabaseClient {
  const e = sbEnv();
  return createClient(e.url, e.anon, { auth: { persistSession: false } });
}

/** Create a fresh user and return a client authenticated as them (via admin magic link). */
export async function userClient(): Promise<{
  client: SupabaseClient;
  userId: string;
  email: string;
}> {
  const admin = adminClient();
  const email = `t-${randomUUID()}@test.local`;
  const { error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (ce) throw ce;
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const client = anonClient();
  const { data: v, error: e2 } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  });
  if (e2) throw e2;
  return { client, userId: v.user!.id, email };
}
