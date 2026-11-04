import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createInvite, createPdfReview, signInNewOwner } from './helpers/owner';
import { fakeMic } from './helpers/talk';

const serious = async (page: import('@playwright/test').Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id);

test('privacy and contact pages are public, accessible and linked from home and sign-in', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  // Phase A wording: audio and AI stay on this computer.
  await expect(
    page.getByText('Your audio stays on this computer.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/never used to train AI/)).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({
    path: `test-results/shots/privacy-${info.project.name}.png`,
    fullPage: true,
  });

  await page.getByRole('link', { name: 'Contact and takedown' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contact and takedown' })).toBeVisible();
  // No CONTACT_EMAIL in the e2e build: the page says so instead of showing a fake address.
  await expect(page.getByTestId('contact-email')).toContainText('No contact email is set up');
  expect(await serious(page)).toEqual([]);
  await page.screenshot({
    path: `test-results/shots/contact-${info.project.name}.png`,
    fullPage: true,
  });

  await page.goto('/sign-in');
  await expect(page.getByRole('link', { name: 'Contact and takedown' })).toBeVisible();
});

test('reviewers can open the privacy notice from the recording consent and the submit sheet', async ({
  page,
  browser,
}, info) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'CV' });
  const link = await createInvite(page, 'Ola');
  const ctx = await browser.newContext({ ...info.project.use });
  const rev = await ctx.newPage();
  await fakeMic(rev);
  await rev.goto(link);
  await rev.getByRole('button', { name: 'Got it' }).click();

  await rev.getByRole('button', { name: 'Record' }).click();
  const consent = rev.getByRole('dialog', { name: 'Before you record' });
  const fromConsent = consent.getByRole('link', { name: 'Read the privacy notice' });
  await expect(fromConsent).toHaveAttribute('href', '/privacy');
  await expect(fromConsent).toHaveAttribute('target', '_blank');
  await consent.getByRole('button', { name: 'Not now' }).click();

  await rev.getByRole('button', { name: 'Submit' }).click();
  const sheet = rev.getByRole('dialog', { name: 'Send your feedback' });
  const [tab] = await Promise.all([
    rev.context().waitForEvent('page'),
    sheet.getByRole('link', { name: 'Privacy' }).click(),
  ]);
  await expect(tab.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  // The review is still there in the original tab.
  await expect(sheet).toBeVisible();
  await ctx.close();
});
