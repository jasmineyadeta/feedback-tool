import { test } from '@playwright/test';

// Captures reference screenshots for changelog entries into test-results/shots/ (never into docs/,
// so verify doesn't dirty the tree). Copy the ones you need into docs/changelog/img/.
const pages = [{ name: 'home', path: '/' }];

for (const p of pages) {
  test(`screenshot ${p.name}`, async ({ page }, info) => {
    await page.goto(p.path);
    await page.screenshot({
      path: `test-results/shots/${p.name}-${info.project.name}.png`,
      fullPage: true,
    });
  });
}
