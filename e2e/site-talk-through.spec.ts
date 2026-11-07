import { expect, test } from '@playwright/test';
import { admin, createInvite, createSiteReview, signInNewOwner } from './helpers/owner';
import { fakeMic, setScript, startRecording } from './helpers/talk';

const SPA = 'http://localhost:4602';

/** Sentence 1 (about the home headline) is said at once; sentence 2 long after the tap on /work. */
const SCRIPT = {
  words: [
    ...'grace builds data products is a great headline'.split(' ').map((w, i) => ({
      w,
      start: i * 0.07,
      end: i * 0.07 + 0.06,
    })),
    ...'this project needs a clearer outcome'.split(' ').map((w, i) => ({
      w,
      start: 50 + i * 0.4,
      end: 50 + i * 0.4 + 0.3,
    })),
  ],
};

test('talk-through across two pages of a live site → correctly anchored comments (mock AI)', async ({
  browser,
  page,
}, info) => {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await signInNewOwner(owner);
  await createSiteReview(owner, { url: `${SPA}/`, title: 'Talk site' });
  const reviewId = owner.url().split('/').pop()!;
  const link = await createInvite(owner, 'Kai');

  await fakeMic(page);
  await page.goto(link);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  const site = page.frameLocator('[data-testid=site-frame]');

  await startRecording(page);
  // Links still navigate while recording (clicks on other things become taps).
  await site.getByRole('link', { name: 'Work' }).click();
  await expect(page.getByTestId('site-path')).toHaveText('/work');
  await page.waitForTimeout(1300); // tap well after sentence 1
  await site.getByRole('heading', { name: 'Hospital dashboard' }).click();
  await expect(site.locator('#__ft_root')).toBeAttached(); // overlay drew the tap marker
  await page.screenshot({ path: `test-results/shots/site-recording-${info.project.name}.png` });

  await setScript(page, SCRIPT);
  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await page.getByRole('button', { name: 'Stop' }).click();
  const cards = page.getByTestId('reviewer-comment');
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  // Untapped sentence: the (mock) AI places it on the home headline it names, from the home-page snapshot.
  await expect(cards.nth(0)).toContainText('Auto-placed');
  await expect(cards.nth(0)).toContainText('Home page');
  // Tapped sentence: anchored to what was tapped on /work.
  await expect(cards.nth(1)).toContainText('Tapped');
  await expect(cards.nth(1)).toContainText('/work');
  await page.screenshot({ path: `test-results/shots/site-recorded-list-${info.project.name}.png` });
  await saved;

  const { data } = await admin()
    .from('comments')
    .select('page_path,anchor,anchor_source,text')
    .eq('review_id', reviewId)
    .order('sort_key');
  expect(data!.map((r) => [r.page_path, r.anchor_source, r.anchor.kind])).toEqual([
    ['/', 'ai', 'dom'],
    ['/work', 'tap', 'dom'],
  ]);
  expect(data![0]!.anchor.textQuote.exact).toBe('Grace builds data products');
  expect(data![1]!.anchor.textQuote.exact).toBe('Hospital dashboard');
  expect(data![1]!.text).toBe('This project needs a clearer outcome');
  await ctx.close();
});
