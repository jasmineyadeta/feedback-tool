import { expect, test, type Page } from '@playwright/test';
import { admin, createInvite, createSiteReview, signInNewOwner } from './helpers/owner';

const PAGE = 'http://localhost:4601/mutable.html';
const site = (page: Page) => page.frameLocator('[data-testid=site-frame]');

/** The fixture reads its version from localStorage in the proxied frame; reload to apply. */
async function mutate(page: Page, version: number) {
  const frame = page.frames().find((f) => f.url().startsWith('http://localhost:8788/'))!;
  await frame.evaluate((v) => localStorage.setItem('ft-mutation', String(v)), version);
  await page.reload();
  await expect(page.getByTestId('site-path')).toHaveText('/mutable.html');
}

async function openComment(page: Page, text: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /^Comments \(/ }).click();
  await page
    .getByTestId('feedback-comment')
    .filter({ hasText: text })
    .getByRole('button')
    .first()
    .click();
}

test('owner sees website feedback; re-anchoring falls back textQuote → cssPath → rect → screenshot', async ({
  browser,
  page,
}, info) => {
  const mobile = info.project.name === 'webkit-iphone';
  await signInNewOwner(page);
  await createSiteReview(page, { url: PAGE, title: 'Pricing page' });
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Ana');

  // Reviewer (own browser context, same device) comments on a paragraph and the image, then submits.
  const rctx = await browser.newContext({ ...info.project.use });
  const rev = await rctx.newPage();
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();
  await expect(rev.getByTestId('site-path')).toHaveText('/mutable.html');
  for (const [target, text] of [
    ['Starter costs ten dollars a month for one seat.', 'Say what a seat is.'],
    ['img', 'The chart needs labels.'],
  ]) {
    await rev.getByRole('button', { name: 'Add comment' }).click();
    const el =
      target === 'img'
        ? site(rev).getByRole('img', { name: 'Pricing chart' })
        : site(rev).getByText(target!);
    await el.click();
    await rev.getByLabel('Your comment', { exact: true }).fill(text!);
    await rev.getByRole('button', { name: 'Save comment' }).click();
  }
  await rev.getByRole('button', { name: 'Submit' }).click();
  const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('ana@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await rctx.close();

  // Submit captured a page screenshot (reviewer's width) for both comments, after the response.
  await expect
    .poll(async () => {
      const { data } = await admin()
        .from('comments')
        .select('screenshot_file_key')
        .eq('review_id', reviewId)
        .not('screenshot_file_key', 'is', null);
      return data?.length;
    })
    .toBe(2);

  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('site-path')).toHaveText('/mutable.html');
  const status = page.getByTestId('locate-status');
  const expectMethod = async (text: string, method: string) => {
    await openComment(page, text, mobile);
    await expect(status).toHaveAttribute('data-method', method);
  };

  // 0: unchanged page.
  await expectMethod('Say what a seat is.', 'textQuote');
  await expectMethod('The chart needs labels.', 'cssPath');
  // 1: small text edit → fuzzy textQuote; image re-wrapped with new alt → found by its file name.
  await mutate(page, 1);
  await expectMethod('Say what a seat is.', 'textQuote');
  await expectMethod('The chart needs labels.', 'cssPath');
  // 2: content replaced, same layout and width → where it used to be, with a note.
  await mutate(page, 2);
  await expectMethod('Say what a seat is.', 'rect');
  await expect(status).toContainText('changed since the review');
  await page.screenshot({ path: `test-results/shots/owner-site-rect-${info.project.name}.png` });
  // 3: different window width too → the stored screenshot with the marker.
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width + 300, height: vp.height });
  await page.reload();
  await expect(page.getByTestId('site-path')).toHaveText('/mutable.html');
  await expectMethod('Say what a seat is.', 'none');
  const shot = page.getByRole('dialog', { name: 'Screenshot from the review' });
  await expect(shot).toContainText('This part of the page has changed since the review.');
  await expect(
    shot.getByRole('img', { name: 'The page when the review was submitted' }),
  ).toBeVisible();
  await expect(shot.getByTestId('screenshot-marker')).toHaveText('1');
  await page.screenshot({
    path: `test-results/shots/owner-site-screenshot-${info.project.name}.png`,
  });
  await shot.getByRole('button', { name: 'Back to the live page' }).click();
  await expect(shot).toHaveCount(0);
});
