import { expect, test } from '@playwright/test';

test('home page renders and is not indexable', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to start' })).toBeVisible();
});

test('health endpoint', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
});
