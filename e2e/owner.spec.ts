import { expect, test } from '@playwright/test';
import { createInvite, createPdfReview, sb, signInNewOwner } from './helpers/owner';

test('dev sign-in shortcut does not exist in a production build', async ({ page, request }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sign in as Jas/ })).toHaveCount(0);
  const res = await request.post('/api/dev/sign-in', { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test('owner pages require sign-in', async ({ page }) => {
  await page.goto('/reviews');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('magic link arrives in the local inbox and signs the owner in', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'one browser is enough for the email round-trip');
  const email = `magic-${Date.now()}@test.local`;
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email for a sign-in link.')).toBeVisible();
  let link = '';
  await expect
    .poll(
      async () => {
        const list = await (
          await request.get(
            `${sb().MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(email)}`,
          )
        ).json();
        const id = list.messages?.[0]?.ID;
        if (!id) return false;
        const msg = await (await request.get(`${sb().MAILPIT_URL}/api/v1/message/${id}`)).json();
        link = /href="([^"]+)"/.exec(msg.HTML)?.[1]?.replace(/&amp;/g, '&') ?? '';
        return link.includes('token_hash=');
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(link.startsWith('http://localhost:3100/auth/confirm')).toBe(true);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Your reviews' })).toBeVisible();
});

test('owner creates a PDF review, invites a reviewer, and revokes', async ({ page }) => {
  await signInNewOwner(page);
  await expect(page.getByText('No reviews yet.')).toBeVisible();
  await createPdfReview(page, { title: 'Resume fall 2026', context: 'Applying to APM roles.' });
  await expect(page.getByRole('heading', { name: 'Resume fall 2026' })).toBeVisible();
  await expect(page.getByText('PDF · 2 pages')).toBeVisible();
  const link = await createInvite(page, 'Priya');
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText('Not started')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoked')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Revoked')).toBeVisible();
  await expect(page.getByLabel('Reviewer link')).toHaveCount(0); // link shown once only
});

test('a non-PDF is rejected with a clear message and nothing is left behind', async ({ page }) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Bad', file: 'apps/web/test/fixtures/not-a-pdf.pdf' });
  await expect(page.locator('form').getByRole('alert')).toContainText("isn't a PDF");
  await page.goto('/reviews');
  await expect(page.getByText('No reviews yet.')).toBeVisible();
});
