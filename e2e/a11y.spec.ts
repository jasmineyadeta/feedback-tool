import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createInvite, createPdfReview, createSiteReview, signInNewOwner } from './helpers/owner';

/**
 * M5 accessibility gate: zero serious/critical axe violations on key pages (WCAG 2.1 A/AA rules).
 * The reviewed website inside the proxy frame is the candidate's content, not ours, so it's excluded.
 */
async function scan(page: Page, name: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[data-testid=site-frame]')
    .analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${name}: ${v.id} (${v.impact}) ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

test('axe: public and owner pages', async ({ page }, info) => {
  await page.goto('/');
  await scan(page, 'home');
  await page.goto('/sign-in');
  await scan(page, 'sign-in');
  await page.goto('/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await scan(page, 'dead link');
  await signInNewOwner(page);
  await scan(page, 'reviews (empty)');
  await page.goto('/reviews/new');
  await scan(page, 'new review');
  await createPdfReview(page, { title: 'A11y PDF', context: 'Context.' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  await createInvite(page, 'Ida');
  await scan(page, 'review page');
  await page.goto('/reviews');
  await scan(page, 'reviews (list)');
  await page.goto('/reviews/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible();
  await scan(page, 'not found');
  await page.screenshot({ path: `test-results/shots/not-found-${info.project.name}.png` });
});

test('axe: reviewer PDF page, composer, submit sheet; owner feedback', async ({
  browser,
  page,
}) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'A11y PDF', context: 'Look at the summary.' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Ida');
  const rctx = await browser.newContext();
  const rev = await rctx.newPage();
  await rev.goto(link);
  await expect(rev.locator('[data-page="1"] .textLayer span').first()).toBeAttached();
  await scan(rev, 'reviewer pdf (coach mark)');
  await rev.getByRole('button', { name: 'Got it' }).click();
  await rev.getByRole('button', { name: 'Add comment' }).click();
  await rev.getByRole('region', { name: 'Page 1' }).click({ position: { x: 90, y: 120 } });
  await rev.getByLabel('Your comment', { exact: true }).fill('Lead with impact.');
  await scan(rev, 'composer');
  await rev.getByRole('button', { name: 'Save comment' }).click();
  await rev.getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByRole('dialog', { name: 'Send your feedback' })).toBeVisible();
  await scan(rev, 'submit sheet');
  await rev.getByLabel('Your email').fill('ida@example.com');
  await rev.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await scan(rev, 'reviewer submitted');
  await rctx.close();
  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('feedback-comment')).toHaveCount(1);
  await scan(page, 'owner feedback pdf');
});

test('axe: reviewer website page (live) and Screenshot mode', async ({ browser, page }) => {
  await signInNewOwner(page);
  await createSiteReview(page, { url: 'http://localhost:4602/', title: 'A11y site' });
  const live = await createInvite(page, 'Ida');
  await createSiteReview(page, { url: 'http://localhost:4601/?fail-health', title: 'A11y shot' });
  const shot = await createInvite(page, 'Ida');
  const rctx = await browser.newContext();
  const rev = await rctx.newPage();
  await rev.goto(live);
  await rev.getByRole('button', { name: 'Got it' }).click();
  await expect(rev.getByTestId('site-path')).toHaveText('Home page');
  await scan(rev, 'reviewer site');
  await rev.goto(shot);
  await expect(rev.getByTestId('screenshot-label')).toBeVisible();
  await scan(rev, 'reviewer screenshot');
  await rctx.close();
});

test('keyboard only: pin a comment on a PDF page and on a live site; Escape cancels', async ({
  browser,
  page,
}) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Keys PDF' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const pdfLink = await createInvite(page, 'Kim');
  await createSiteReview(page, { url: 'http://localhost:4602/', title: 'Keys site' });
  const siteLink = await createInvite(page, 'Kim');

  const rctx = await browser.newContext();
  const rev = await rctx.newPage();
  await rev.goto(pdfLink);
  await rev.getByRole('button', { name: 'Got it' }).click();
  await expect(rev.locator('[data-page="1"] .textLayer span').first()).toBeAttached();
  const add = rev.getByRole('button', { name: 'Add comment' });
  await add.focus();
  await rev.keyboard.press('Enter');
  await rev.keyboard.press('Escape'); // cancels "tap the spot"
  await expect(rev.getByText('Tap the spot your comment is about.')).toHaveCount(0);
  await add.focus();
  await rev.keyboard.press('Enter');
  await rev.getByRole('region', { name: 'Page 1' }).focus();
  await rev.keyboard.press('Enter');
  const box = rev.getByRole('dialog', { name: 'Comment' });
  await expect(box).toContainText('Page 1');
  await expect(box.getByLabel('Your comment', { exact: true })).toBeFocused();
  await rev.keyboard.type('Typed with keys.');
  await rev.keyboard.press('Escape');
  await expect(box).toHaveCount(0);

  await rev.goto(siteLink); // the coach mark was already dismissed in this browser
  await expect(rev.getByTestId('site-path')).toHaveText('Home page');
  await rev.getByRole('button', { name: 'Add comment' }).click();
  const frame = rev.frameLocator('[data-testid=site-frame]');
  await expect(frame.locator('html')).toHaveAttribute('data-ft-capture', ''); // overlay is in pick mode
  await frame.getByRole('button', { name: 'Menu' }).focus();
  await rev.keyboard.press('Enter');
  await expect(rev.getByRole('dialog', { name: 'Comment' })).toContainText('“Menu”');
  await rctx.close();
});

test('axe: recording consent, split preview, owner website feedback', async ({ browser, page }) => {
  const { fakeMic, setScript } = await import('./helpers/talk');
  await signInNewOwner(page);
  await createSiteReview(page, { url: 'http://localhost:4602/', title: 'A11y talk' });
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Ida');
  const rctx = await browser.newContext();
  const rev = await rctx.newPage();
  await fakeMic(rev);
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();
  await expect(rev.getByTestId('site-path')).toHaveText('Home page');
  await rev.getByRole('button', { name: 'Record' }).click();
  await expect(rev.getByRole('dialog', { name: 'Before you record' })).toBeVisible();
  await scan(rev, 'consent sheet');
  await rev.getByRole('button', { name: 'Start recording' }).click();
  await expect(rev.getByRole('status', { name: 'Recording' })).toBeVisible();
  await scan(rev, 'recording bar');
  await setScript(rev, { text: 'grace builds data products is a great headline' });
  await rev.getByRole('button', { name: 'Stop' }).click();
  const preview = rev.getByRole('dialog', { name: 'Here’s what we heard' });
  await expect(preview).toBeVisible({ timeout: 15000 });
  await scan(rev, 'split preview');
  await preview.getByRole('button', { name: 'Looks good' }).click();
  await rev.getByRole('button', { name: 'Submit' }).click();
  await rev.getByRole('dialog').getByLabel('Your email').fill('ida@example.com');
  await rev.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await rctx.close();
  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  await scan(page, 'owner feedback site');
});
