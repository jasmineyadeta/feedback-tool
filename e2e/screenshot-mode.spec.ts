import { expect, test } from '@playwright/test';
import { admin, createInvite, createSiteReview, signInNewOwner } from './helpers/owner';
import { fakeMic, setScript, startRecording } from './helpers/talk';

// The mock ScreenshotService fails the headless check for URLs containing "fail-health".
const URL = 'http://localhost:4601/?fail-health';

test('Screenshot mode is labelled to the reviewer and the owner; comments and talk-through work on it', async ({
  browser,
  page,
}, info) => {
  const mobile = info.project.name === 'webkit-iphone';
  await signInNewOwner(page);
  await createSiteReview(page, { url: URL, title: 'Shot site' });
  await expect(page.getByTestId('site-mode')).toContainText('Screenshot mode');
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Lee');

  const rctx = await browser.newContext({ ...info.project.use });
  const rev = await rctx.newPage();
  await fakeMic(rev);
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();
  // Reviewer: always told it's a picture, never the live site; no live frame at all.
  await expect(rev.getByTestId('screenshot-label')).toContainText('not the live site');
  await expect(rev.getByTestId('site-frame')).toHaveCount(0);
  const shot = rev.getByRole('img', { name: 'Screenshot of the home page' });
  await expect(shot).toBeVisible();
  // The phone gets the phone-width screenshot.
  expect(await shot.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(mobile ? 390 : 1280);

  // Typed comment: tap the picture.
  await rev.getByRole('button', { name: 'Add comment' }).click();
  await shot.click({ position: { x: 60, y: 80 } });
  await rev.getByLabel('Your comment', { exact: true }).fill('Bigger name please.');
  await rev.getByRole('button', { name: 'Save comment' }).click();
  await expect(rev.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  await rev.screenshot({ path: `test-results/shots/screenshot-reviewer-${info.project.name}.png` });

  // Talk-through: one untapped sentence ("On screen"), then a tap.
  await startRecording(rev);
  await rev.waitForTimeout(1200);
  await shot.click({ position: { x: 100, y: 200 } });
  await setScript(rev, {
    words: [
      ...'overall this looks clean'
        .split(' ')
        .map((w, i) => ({ w, start: i * 0.1, end: i * 0.1 + 0.08 })),
      ...'this part needs a photo'
        .split(' ')
        .map((w, i) => ({ w, start: 50 + i * 0.4, end: 50 + i * 0.4 + 0.3 })),
    ],
  });
  await rev.getByRole('button', { name: 'Stop' }).click();
  const preview = rev.getByRole('dialog', { name: 'Here’s what we heard' });
  const cards = preview.getByTestId('proposed-comment');
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  await expect(cards.nth(0)).toContainText('On screen');
  await expect(cards.nth(1)).toContainText('Tapped');
  await expect(cards.nth(1)).toContainText('Screenshot');
  const saved = rev.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await preview.getByRole('button', { name: 'Looks good' }).click();
  await saved;

  await rev.getByRole('button', { name: 'Submit' }).click();
  const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('lee@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await rctx.close();

  const { data } = await admin().from('comments').select('anchor').eq('review_id', reviewId);
  expect(data!.map((r) => r.anchor.kind)).toEqual(['screenshot', 'screenshot', 'screenshot']);
  expect(new Set(data!.map((r) => r.anchor.imageKey))).toEqual(
    new Set([mobile ? 'entry-390' : 'entry-1280']),
  );

  // Owner: same label, markers on the screenshot.
  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('screenshot-label')).toContainText(
    'Reviewers saw this screenshot, not the live site.',
  );
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment 3' })).toBeAttached();
  await page.screenshot({ path: `test-results/shots/screenshot-owner-${info.project.name}.png` });
});

test('the server refuses DOM anchors and unknown images on a Screenshot-mode review', async ({
  browser,
  page,
}) => {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await signInNewOwner(owner);
  await createSiteReview(owner, { url: URL });
  const token = (await createInvite(owner, 'X')).split('/').pop()!;
  const send = (anchor: unknown) =>
    page.request.post(`/api/r/${token}/sync`, {
      data: {
        ops: [
          {
            op: 'upsert',
            comment: { clientId: 'abcdef123', text: 'x', anchor, general: false, sortKey: 1 },
          },
        ],
      },
    });
  const shot = (imageKey: string) => ({
    kind: 'screenshot',
    pagePath: '/',
    imageKey,
    point: { xPct: 0.1, yPct: 0.1 },
  });
  expect((await send(shot('entry-390'))).status()).toBe(200);
  expect((await send(shot('../../other-owner/x.png'))).status()).toBe(400);
  expect(
    (
      await send({
        kind: 'viewport',
        pageUrl: 'http://x/',
        pagePath: '/',
        scroll: { x: 0, y: 0 },
        viewport: { w: 300, h: 300 },
        visibleTextSample: '',
      })
    ).status(),
  ).toBe(400);
  await ctx.close();
});
