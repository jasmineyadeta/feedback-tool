import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, createInvite, createSiteReview, signInNewOwner } from './helpers/owner';

const SPA = 'http://localhost:4602';

/** Owner creates a live website review of the SPA fixture + one invite; returns the reviewer link. */
async function setup(browser: Browser) {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await signInNewOwner(owner);
  await createSiteReview(owner, { url: `${SPA}/`, title: 'Portfolio site' });
  await expect(owner.getByTestId('site-mode')).toContainText('Live site');
  const reviewId = owner.url().split('/').pop()!;
  const link = await createInvite(owner, 'Sam');
  return { owner, reviewId, link };
}

async function openAsReviewer(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Portfolio site' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
}

const site = (page: Page) => page.frameLocator('[data-testid=site-frame]');

async function commentOn(page: Page, target: string, text: string) {
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByText('Tap the spot your comment is about.')).toBeVisible();
  await site(page).getByRole('heading', { name: target }).click();
  const box = page.getByRole('dialog', { name: 'Comment' });
  await expect(box).toContainText(`“${target}”`);
  await box.getByLabel('Your comment', { exact: true }).fill(text);
  await box.getByRole('button', { name: 'Save comment' }).click();
}

test('reviewer comments on two pages of a live site; anchors are stored by page and restore', async ({
  browser,
  page,
}, info) => {
  const s = await setup(browser);
  await openAsReviewer(page, s.link);

  await commentOn(page, 'Grace builds data products', 'Strong headline.');
  // Navigate inside the site (SPA pushState through the proxy); the shell follows along.
  await site(page).getByRole('link', { name: 'About' }).click();
  await expect(page.getByTestId('site-path')).toHaveText('/about');
  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await commentOn(page, 'About Grace', 'Say what kind of data.');
  await saved;
  await page.screenshot({ path: `test-results/shots/site-reviewer-${info.project.name}.png` });

  // Jumping to a comment on another page loads that page in the frame.
  if (info.project.name === 'webkit-iphone')
    await page.getByRole('button', { name: /^Comments/ }).click();
  await page
    .getByTestId('reviewer-comment')
    .filter({ hasText: 'Strong headline.' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByTestId('site-path')).toHaveText('Home page');

  // Reload: both comments come back with their page labels, markers drawn on the current page.
  await page.reload();
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  if (info.project.name === 'webkit-iphone')
    await page.getByRole('button', { name: /^Comments/ }).click();
  const items = page.getByTestId('reviewer-comment');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('1 · Home page');
  await expect(items.nth(1)).toContainText('2 · /about');

  const { data } = await admin()
    .from('comments')
    .select('page_path,anchor,anchor_source')
    .eq('review_id', s.reviewId)
    .order('sort_key');
  expect(data!.map((r) => r.page_path)).toEqual(['/', '/about']);
  for (const r of data!) {
    expect(r.anchor.kind).toBe('dom');
    expect(r.anchor_source).toBe('manual');
    // Stored against the real site, never the proxy host.
    expect(r.anchor.pageUrl).toBe(`${SPA}${r.page_path}`);
  }
  await s.owner.context().close();
});

test('the server refuses PDF anchors on a website review', async ({ browser, page }) => {
  const s = await setup(browser);
  const token = s.link.split('/').pop()!;
  const res = await page.request.post(`/api/r/${token}/sync`, {
    data: {
      ops: [
        {
          op: 'upsert',
          comment: {
            clientId: 'abcdef123',
            text: 'x',
            anchor: { kind: 'pdf-page', page: 1, visibleTextSample: '' },
            general: false,
            sortKey: 1,
          },
        },
      ],
    },
  });
  expect(res.status()).toBe(400);
  await s.owner.context().close();
});
