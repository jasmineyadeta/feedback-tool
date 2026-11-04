import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

let env: Record<string, string> | null = null;
export function sb() {
  if (!env) {
    env = {};
    for (const line of execSync('supabase status -o env', { encoding: 'utf8' }).split('\n')) {
      const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
      if (m) env[m[1]!] = m[2]!;
    }
  }
  return env;
}
export function admin() {
  return createClient(sb().API_URL!, sb().SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Signs a fresh owner into the browser via a real magic-link token (no dev shortcut; works on prod builds). */
export async function signInNewOwner(page: Page): Promise<{ email: string; userId: string }> {
  const email = `owner-${randomUUID()}@test.local`;
  const a = admin();
  const { data: u } = await a.auth.admin.createUser({ email, email_confirm: true });
  const { data } = await a.auth.admin.generateLink({ type: 'magiclink', email });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&next=/reviews`);
  await page.waitForURL('**/reviews');
  return { email, userId: u.user!.id };
}

export async function createPdfReview(
  page: Page,
  opts: { title: string; file?: string; context?: string },
) {
  await page.goto('/reviews/new');
  await page.locator('label', { hasText: /^PDF$/ }).click(); // the radio itself is visually hidden
  await page
    .getByLabel(/PDF \(up to/)
    .setInputFiles(opts.file ?? 'apps/web/test/fixtures/resume-2p.pdf');
  await page.getByLabel(/Title/).fill(opts.title);
  if (opts.context) await page.getByLabel(/Context for reviewers/).fill(opts.context);
  await page.getByRole('button', { name: 'Create review' }).click();
}

/** Website review on a local fixture site (ALLOW_FIXTURE_HOSTS in e2e). Waits for the review page. */
export async function createSiteReview(page: Page, opts: { url: string; title?: string }) {
  await page.goto('/reviews/new');
  await page.getByLabel('Website address').fill(opts.url);
  if (opts.title) await page.getByLabel(/Title/).fill(opts.title);
  await page.getByRole('button', { name: 'Create review' }).click();
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/, { timeout: 30_000 });
}

export async function createInvite(page: Page, name = ''): Promise<string> {
  if (name) await page.getByLabel(/Reviewer name/).fill(name);
  await page.getByRole('button', { name: 'Create reviewer link' }).click();
  return page.getByLabel('Reviewer link').inputValue();
}
