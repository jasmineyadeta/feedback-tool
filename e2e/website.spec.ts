import { expect, test } from '@playwright/test';
import { admin, createSiteReview, signInNewOwner } from './helpers/owner';

// Fixture sites (apps/proxy/fixtures) are allowed hosts in e2e only (ENVIRONMENT=test).
const STATIC = 'http://localhost:4601';

const shot = (page: import('@playwright/test').Page, name: string, project: string) =>
  page.screenshot({ path: `test-results/shots/${name}-${project}.png`, fullPage: true });

test('website review: a healthy site is reviewed live', async ({ page }, info) => {
  await signInNewOwner(page);
  await page.goto('/reviews/new');
  await page.getByLabel('Website address').fill(`${STATIC}/`);
  await shot(page, 'new-review-website', info.project.name);
  await createSiteReview(page, { url: `${STATIC}/`, title: 'Portfolio' });
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByText('Website · localhost:4601/')).toBeVisible();
  const mode = page.getByTestId('site-mode');
  await expect(mode).toContainText('Live site');
  await expect(mode).toContainText('can click through its pages');
  const id = page.url().split('/').pop()!;
  const { data } = await admin()
    .from('reviews')
    .select('render_mode,health_report')
    .eq('id', id)
    .single();
  expect(data!.render_mode).toBe('live');
  expect(data!.health_report.platform).toBe('static');
  expect(data!.health_report.screens).toEqual([]);
});

test('website review: a failed headless check falls back to labelled Screenshot mode', async ({
  page,
}, info) => {
  await signInNewOwner(page);
  // The mock ScreenshotService fails the headless check for URLs containing "fail-health".
  await createSiteReview(page, { url: `${STATIC}/?fail-health` });
  const mode = page.getByTestId('site-mode');
  await expect(mode).toContainText('Screenshot mode');
  await expect(mode).toContainText('showed an error when opened in review mode');
  await expect(mode).toContainText('can’t click through to other pages');
  await shot(page, 'review-screenshot-mode', info.project.name);
  const id = page.url().split('/').pop()!;
  const { data } = await admin()
    .from('reviews')
    .select('render_mode,health_report')
    .eq('id', id)
    .single();
  expect(data!.render_mode).toBe('screenshot');
  const screens = data!.health_report.screens as { width: number; key: string }[];
  expect(screens.map((s) => s.width)).toEqual([390, 1280]);
  const file = await admin().storage.from('screenshots').download(screens[0]!.key);
  expect(file.error).toBeNull();
  expect(new Uint8Array(await file.data!.arrayBuffer()).slice(1, 4)).toEqual(
    new Uint8Array([0x50, 0x4e, 0x47]), // "PNG"
  );
});

test('website review: unreachable and unsafe addresses are refused with a clear message', async ({
  page,
}) => {
  await signInNewOwner(page);
  await page.goto('/reviews/new');
  const field = page.getByLabel('Website address');
  const create = page.getByRole('button', { name: 'Create review' });
  await field.fill(`${STATIC}/missing.html`);
  await create.click();
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'That page returned an error (404). Check the address and try again.',
  );
  await field.fill('http://127.0.0.1:4601/');
  await create.click();
  await expect(page.locator('form').getByRole('alert')).not.toHaveText(/404/);
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/reviews\/new$/);
});
