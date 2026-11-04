import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createInvite, createPdfReview, signInNewOwner } from './helpers/owner';

/** e2e uses Mailer.mock, which writes each message to .run/e2e-outbox (scripts/e2e-app.sh). */
function outboxFor(to: string) {
  const dir = '.run/e2e-outbox';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) =>
        JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as {
          to: string;
          subject: string;
          text: string;
          html?: string;
        },
    )
    .filter((m) => m.to === to);
}

test('invite statuses follow D20 and the owner is emailed a link (only) on submit', async ({
  browser,
  page,
}) => {
  const { email } = await signInNewOwner(page);
  await createPdfReview(page, { title: 'Resume v3' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = page.url().split('/').pop()!;
  const link = await createInvite(page, 'Rae');
  const status = page.getByTestId('invite-status');
  await expect(status).toHaveText('Not started');

  const rctx = await browser.newContext();
  const rev = await rctx.newPage();
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();
  // Opening the link is not tracked (no read receipts): still Not started.
  await page.reload();
  await expect(status).toHaveText('Not started');

  await expect(rev.locator('[data-page="1"] .textLayer span').first()).toBeAttached();
  await rev.getByRole('button', { name: 'Add comment' }).click();
  await rev.getByRole('region', { name: 'Page 1' }).click({ position: { x: 90, y: 120 } });
  const secret = 'PRIVATE-COMMENT-TEXT lead with impact';
  await rev.getByLabel('Your comment', { exact: true }).fill(secret);
  const saved = rev.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await rev.getByRole('button', { name: 'Save comment' }).click();
  await saved;
  await page.reload();
  await expect(status).toHaveText('In progress');

  await rev.getByRole('button', { name: 'Submit' }).click();
  const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('rae-private@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(rev.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await page.reload();
  await expect(status).toHaveText('Submitted');

  await expect.poll(() => outboxFor(email).length).toBe(1);
  const [mail] = outboxFor(email);
  expect(mail!.subject).toBe('Rae sent feedback on Resume v3');
  expect(mail!.text).toContain(`/reviews/${reviewId}/feedback`);
  for (const body of [mail!.text, mail!.html ?? '']) {
    expect(body).not.toContain('PRIVATE-COMMENT-TEXT');
    expect(body).not.toContain('rae-private@example.com');
  }
  await rctx.close();
});
