import { expect, test } from '@playwright/test';
import { admin, createInvite, createPdfReview, signInNewOwner } from './helpers/owner';

/**
 * After submit, each comment gets a tone for the owner (mock AI in tests): red Action, green Praise,
 * blue Note, always with a word. The owner can filter by tone and click a label to change it.
 */
test('owner sees tone labels after submit, filters by tone, and corrects a label', async ({
  browser,
  page,
}, info) => {
  const mobile = info.project.name === 'webkit-iphone';
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Tone' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Ana');

  const rctx = await browser.newContext({ ...info.project.use });
  const rev = await rctx.newPage();
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();
  for (const [y, text] of [
    [120, 'Love the summary.'],
    [300, 'The dates should be right-aligned.'],
  ] as const) {
    await rev.getByRole('button', { name: 'Add comment' }).click();
    await rev.getByRole('region', { name: 'Page 1' }).click({ position: { x: 100, y } });
    await rev.getByLabel('Your comment', { exact: true }).fill(text);
    await rev.getByRole('button', { name: 'Save comment' }).click();
  }
  await rev.getByRole('button', { name: 'Submit' }).click();
  const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('ana@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  // Reviewers never see tones.
  await expect(rev.getByText(/^(Action|Praise)$/)).toHaveCount(0);
  await rctx.close();

  // Labelling runs right after submit (after the response).
  await expect
    .poll(async () => {
      const { data } = await admin().from('comments').select('tone').eq('review_id', reviewId);
      return data?.filter((c) => c.tone).length;
    })
    .toBe(2);

  await page.goto(`/reviews/${reviewId}/feedback`);
  const openList = async () => {
    if (mobile) await page.getByRole('button', { name: /^Comments \(/ }).click();
  };
  await openList();
  const praise = page.getByTestId('feedback-comment').filter({ hasText: 'Love the summary' });
  const action = page.getByTestId('feedback-comment').filter({ hasText: 'dates should' });
  await expect(praise.getByTestId('tone')).toHaveText('Praise');
  await expect(action.getByTestId('tone')).toHaveText('Action');
  await expect(action.locator('span.bg-red-600')).toHaveCount(1); // red number in the list
  await page.screenshot({ path: `test-results/shots/tone-${info.project.name}.png` });

  // Filter: Action only.
  await page.getByLabel('Filter by tone').selectOption('action');
  await expect(page.getByTestId('feedback-comment')).toHaveCount(1);
  await expect(page.getByTestId('feedback-comment')).toContainText('dates should');
  await page.getByLabel('Filter by tone').selectOption('all');

  // Correct a label: Action → Praise; saved, and the words are unchanged.
  const saved = page.waitForResponse((r) => r.url().includes('/comments/') && r.ok());
  await action.getByRole('button', { name: 'Tone: Action. Change' }).click();
  await saved;
  await expect(action.getByTestId('tone')).toHaveText('Praise');
  const { data } = await admin()
    .from('comments')
    .select('text,tone,tone_source')
    .eq('review_id', reviewId)
    .eq('tone_source', 'owner');
  expect(data).toEqual([
    { text: 'The dates should be right-aligned.', tone: 'praise', tone_source: 'owner' },
  ]);
});
