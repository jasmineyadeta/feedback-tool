import { expect, test } from '@playwright/test';
import { createInvite, createSiteReview, signInNewOwner } from './helpers/owner';
import { fakeMic, setScript, startRecording } from './helpers/talk';

const SPA = 'http://localhost:4602';

test('while recording, tapping the same thing again takes the tap back; reviewer sees pins for on-screen comments', async ({
  browser,
  page,
}, info) => {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await signInNewOwner(owner);
  await createSiteReview(owner, { url: `${SPA}/`, title: 'Untap' });
  const link = await createInvite(owner, 'Kai');

  await fakeMic(page);
  await page.goto(link);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  const site = page.frameLocator('[data-testid=site-frame]');

  await startRecording(page);
  await expect(page.getByText(/Tap again to undo/).filter({ visible: true })).toBeVisible();
  await page.waitForTimeout(600);
  const heading = site.getByRole('heading', { level: 1 });
  await heading.click();
  await expect(site.locator('.num')).toHaveCount(1);
  await heading.click(); // same thing again → the tap is gone
  await expect(site.locator('.num')).toHaveCount(0);

  // Undoing a middle tap renumbers the rest: 1, 2, 3 → undo 2 → 1, 2.
  const nav = site.getByText(/Led a team shipping/);
  const targets = [heading, site.getByRole('heading', { name: 'Highlights' }), nav];
  for (const t of targets) await t.click({ position: { x: 5, y: 5 } });
  await expect(site.locator('.num')).toHaveText(['1', '2', '3']);
  await targets[1]!.click({ position: { x: 5, y: 5 } });
  await expect(site.locator('.num')).toHaveText(['1', '2']);
  for (const t of [heading, nav]) await t.click({ position: { x: 5, y: 5 } }); // clear them again
  await expect(site.locator('.num')).toHaveCount(0);

  // Words the (mock) AI can't place on anything → one "On screen" comment, not "Tapped".
  await setScript(page, { text: 'lovely calm colours overall nice style' });
  await page.getByRole('button', { name: 'Stop' }).click();
  const card = page.getByTestId('reviewer-comment');
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(card).toContainText('On screen');
  await expect(card).not.toContainText('Tapped');

  // The reviewer sees its pin on the site; clicking the pin selects the comment.
  if (await page.getByRole('button', { name: 'Close', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  const pin = site.getByRole('button', { name: 'Comment 1' });
  await expect(pin).toBeAttached();
  await page.screenshot({ path: `test-results/shots/reviewer-pin-${info.project.name}.png` });
  await pin.click();
  await expect(card).toHaveClass(/bg-blue-50/);
  await ctx.close();
});
