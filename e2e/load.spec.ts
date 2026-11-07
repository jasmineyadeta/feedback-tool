import { expect, test } from '@playwright/test';
import { admin, createInvite, createPdfReview, signInNewOwner } from './helpers/owner';
import { fakeMic, setScript, startRecording } from './helpers/talk';

/**
 * M6 load smoke (SPEC §8): 10 reviewers in their own browsers at once, each typing a comment,
 * recording a talk-through (mock transcriber) and submitting. Passes only if every request
 * succeeds, nothing errors in any page, and every comment lands in the database.
 * One browser project is enough: this measures the server, not the browser.
 */
const REVIEWERS = 10;

test('10 concurrent reviewers complete a review without errors', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'server load test; runs once');
  test.setTimeout(240_000);
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Load smoke' });
  const links: string[] = [];
  for (let i = 0; i < REVIEWERS; i++) links.push(await createInvite(page, `R${i}`));
  const reviewId = page.url().split('/').pop()!;

  const problems: string[] = [];
  const started = Date.now();
  await Promise.all(
    links.map(async (link, i) => {
      const ctx = await browser.newContext();
      const rev = await ctx.newPage();
      rev.on('pageerror', (e) => problems.push(`R${i} page error: ${e.message}`));
      rev.on('response', (r) => {
        if (r.url().includes('/api/') && r.status() >= 400)
          problems.push(
            `R${i} ${r.status()} ${new URL(r.url()).pathname.replace(/\/r\/[^/]+/, '/r/…')}`,
          );
      });
      await fakeMic(rev);
      await rev.goto(link);
      await rev.getByRole('button', { name: 'Got it' }).click();

      await rev.getByRole('button', { name: 'Add comment' }).click();
      await rev.getByRole('region', { name: 'Page 1' }).click({ position: { x: 80, y: 120 } });
      await rev.getByLabel('Your comment', { exact: true }).fill(`Typed note from reviewer ${i}.`);
      await rev.getByRole('button', { name: 'Save comment' }).click();
      await expect(rev.getByRole('button', { name: 'Comment 1' })).toBeVisible();

      await startRecording(rev);
      await setScript(rev, { text: `the summary from reviewer ${i} could be shorter` });
      const saved = rev.waitForResponse((r) => r.url().includes('/sync') && r.ok());
      await rev.getByRole('button', { name: 'Stop' }).click();
      await expect(
        rev.getByTestId('reviewer-comment').filter({ hasText: `reviewer ${i} could be shorter` }),
      ).toHaveCount(1, { timeout: 60_000 });
      await saved;

      await rev.getByRole('button', { name: 'Submit' }).click();
      const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
      await sheet.getByLabel('Your name').fill(`Reviewer ${i}`);
      await sheet.getByLabel('Your email').fill(`r${i}@example.com`);
      await sheet.getByRole('button', { name: 'Submit' }).click();
      await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible({
        timeout: 30_000,
      });
      await ctx.close();
    }),
  );
  console.log(`load smoke: ${REVIEWERS} reviewers finished in ${Date.now() - started} ms`);

  expect(problems).toEqual([]);
  const { data: invites, error } = await admin()
    .from('reviewer_invites')
    .select('status')
    .eq('review_id', reviewId);
  expect(error).toBeNull();
  expect(invites!.map((x) => x.status)).toEqual(Array(REVIEWERS).fill('submitted'));
  const { count } = await admin()
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId)
    .eq('state', 'saved')
    .eq('general', false);
  expect(count).toBe(REVIEWERS * 2);
});
