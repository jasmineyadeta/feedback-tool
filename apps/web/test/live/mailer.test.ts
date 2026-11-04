import { execSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { localMailer } from '@/lib/server/adapters/mailer';

/** Live-dev smoke (M5): the local Mailer really lands in the local inbox (Mailpit). Not in `pnpm verify`. */
function mailpit(): string {
  if (process.env.MAILPIT_URL) return process.env.MAILPIT_URL;
  const out = execSync('supabase status -o env', { encoding: 'utf8' });
  return /^MAILPIT_URL="?(.*?)"?$/m.exec(out)?.[1] ?? 'http://127.0.0.1:54324';
}

describe('local mailer (live)', () => {
  it('delivers to the local inbox', async () => {
    const base = mailpit();
    const to = `smoke-${Date.now()}@test.local`;
    await localMailer(base).send({
      to,
      subject: 'Smoke: feedback ready',
      text: 'Read it: http://x/',
    });
    let found = 0;
    for (let i = 0; i < 20 && !found; i++) {
      const res = await fetch(`${base}/api/v1/search?query=to:${encodeURIComponent(to)}`);
      found = ((await res.json()) as { messages_count?: number }).messages_count ?? 0;
      if (!found) await new Promise((r) => setTimeout(r, 250));
    }
    expect(found).toBe(1);
  });
});
