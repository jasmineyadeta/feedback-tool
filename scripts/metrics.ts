/**
 * `pnpm metrics` — prints the PRD §15 numbers from the local database (views in
 * supabase/migrations/20261104000001_metrics_views.sql). Counts only: no text, emails or URLs.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const summary = await db.from('metrics_summary').select('*').single();
  if (summary.error) throw new Error(`Couldn't read metrics: ${summary.error.message}`);
  console.log('Summary');
  console.table(summary.data);
  const render = await db.from('metrics_site_render').select('*');
  if (render.data?.length) {
    console.log('Website render by platform');
    console.table(render.data);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  console.error('Is the local database running? Start it with `pnpm dev`.');
  process.exit(1);
});
