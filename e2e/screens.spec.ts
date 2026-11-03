import { test } from '@playwright/test';

// Captures reference screenshots for changelog entries into test-results/shots/ (never into docs/,
// so verify doesn't dirty the tree). Copy the ones you need into docs/changelog/img/.
const pages = [
  { name: 'home', path: '/', ready: 'h1' },
  {
    name: 'proxy-spa',
    path: `/dev/harness?url=${encodeURIComponent('http://localhost:4602/')}`,
    ready: 'frame:h1',
  },
];

for (const p of pages) {
  test(`screenshot ${p.name}`, async ({ page }, info) => {
    await page.goto(p.path);
    if (p.ready.startsWith('frame:'))
      await page.frameLocator('iframe').locator(p.ready.slice(6)).first().waitFor();
    else await page.locator(p.ready).first().waitFor();
    await page.screenshot({
      path: `test-results/shots/${p.name}-${info.project.name}.png`,
      fullPage: true,
    });
  });
}

test('screenshot owner review page', async ({ page }, info) => {
  const { signInNewOwner, createPdfReview, createInvite } = await import('./helpers/owner');
  await signInNewOwner(page);
  await createPdfReview(page, {
    title: 'Resume fall 2026',
    context: "I'm applying for APM roles at fintech companies.",
  });
  await page.getByRole('heading', { name: 'Resume fall 2026' }).waitFor();
  await createInvite(page, 'Priya');
  await page.screenshot({
    path: `test-results/shots/review-${info.project.name}.png`,
    fullPage: true,
  });
});
