import { expect, test, type Page } from '@playwright/test';
import type { OverlayToShell } from '@ft/shared/protocol';

const FIX = {
  static: 'http://localhost:4601/',
  spa: 'http://localhost:4602/',
  cspXfo: 'http://localhost:4603/',
  sw: 'http://localhost:4604/',
  forms: 'http://localhost:4605/',
  anim: 'http://localhost:4606/',
};

async function open(page: Page, url: string) {
  await page.goto(`/dev/harness?url=${encodeURIComponent(url)}`);
  const frame = page.frameLocator('[data-testid=proxy-frame]');
  await waitMsg(page, (m) => m.type === 'overlay:ready');
  return frame;
}
async function msgs(page: Page): Promise<OverlayToShell[]> {
  return page.evaluate(() => window.__ftMessages ?? []);
}
async function waitMsg(page: Page, pred: (m: OverlayToShell) => boolean, timeout = 15_000) {
  let found: OverlayToShell | undefined;
  await expect
    .poll(
      async () => {
        found = (await msgs(page)).find(pred);
        return !!found;
      },
      { timeout },
    )
    .toBe(true);
  return found!;
}
async function send(page: Page, m: object) {
  await page.evaluate((msg) => window.__ftSend?.({ ft: 1, ...msg } as never), m);
}
async function clearMsgs(page: Page) {
  await page.evaluate(() => (window.__ftMessages = []));
}

test.describe('proxy fixtures', () => {
  test('static site renders, links stay in the proxy, interactions work', async ({ page }) => {
    const f = await open(page, FIX.static);
    await expect(f.getByRole('heading', { level: 1 })).toHaveText(
      'Product designer crafting calm tools',
    );
    await expect(f.locator('img[alt="Ada Lovelace logo"]')).toBeVisible();
    // Browse mode: the site's own click handler works (DOM change).
    await f.getByRole('button', { name: 'Menu' }).click();
    await expect(f.getByText('Drawer opened')).toBeVisible();
    // External link opens outside, marked.
    await expect(f.getByRole('link', { name: 'Elsewhere' })).toHaveAttribute('target', '_blank');
    // Multi-page navigation inside the proxy.
    await clearMsgs(page);
    await f.getByRole('link', { name: 'About' }).click();
    await expect(f.getByRole('heading', { level: 1 })).toHaveText('About me');
    await waitMsg(page, (m) => m.type === 'overlay:ready' && m.pagePath === '/about.html');
  });

  test('pick mode produces an anchor that re-anchors after reload', async ({ page }) => {
    const f = await open(page, FIX.static);
    await send(page, { type: 'pick:start' });
    await f.getByRole('heading', { name: 'Checkout redesign' }).click();
    const picked = await waitMsg(page, (m) => m.type === 'anchor:picked');
    if (picked.type !== 'anchor:picked' || picked.anchor.kind !== 'dom')
      throw new Error('expected dom anchor');
    expect(picked.anchor.textQuote?.exact).toBe('Checkout redesign');
    expect(picked.anchor.elementDescriptor.tag).toBe('h3');
    expect(picked.anchor.pagePath).toBe('/');

    await page.reload();
    await waitMsg(page, (m) => m.type === 'overlay:ready');
    await send(page, { type: 'anchor:show', requestId: 'r1', anchor: picked.anchor, label: '1' });
    const loc = await waitMsg(page, (m) => m.type === 'anchor:located');
    expect(loc).toMatchObject({ requestId: 'r1', found: true, method: 'textQuote' });
  });

  test('recording suppresses site clicks, records taps and timeline', async ({ page }) => {
    const f = await open(page, FIX.static);
    await send(page, { type: 'rec:start', baseline: 0 });
    await waitMsg(page, (m) => m.type === 'timeline');
    await f.getByRole('button', { name: 'Menu' }).click();
    await expect(f.getByText('Drawer opened')).toBeHidden();
    const tap = await waitMsg(page, (m) => m.type === 'tap');
    if (tap.type !== 'tap') throw new Error();
    expect(tap.tap.fullAnchor.kind).toBe('dom');
    const snap = (await msgs(page)).find((m) => m.type === 'timeline');
    if (snap?.type !== 'timeline') throw new Error();
    expect(snap.snapshot.elements.length).toBeGreaterThan(0);
    expect(snap.snapshot.elements.some((e) => e.text.includes('Product designer'))).toBe(true);
    await send(page, { type: 'rec:stop' });
    await f.getByRole('button', { name: 'Menu' }).click();
    await expect(f.getByText('Drawer opened')).toBeVisible();
  });

  test('SPA client router works under the proxy (pushState, back, deep link)', async ({ page }) => {
    const f = await open(page, FIX.spa);
    await expect(f.getByRole('heading', { level: 1 })).toHaveText('Grace builds data products');
    await clearMsgs(page);
    await f.getByRole('link', { name: 'Work' }).click();
    await expect(f.getByRole('heading', { name: 'Hospital dashboard' })).toBeVisible();
    await waitMsg(page, (m) => m.type === 'nav' && m.pagePath === '/work');
    expect((await msgs(page)).some((m) => m.type === 'error')).toBe(false);
    await f.getByRole('link', { name: 'About' }).click();
    await waitMsg(page, (m) => m.type === 'nav' && m.pagePath === '/about');
    await page
      .frameLocator('[data-testid=proxy-frame]')
      .locator('body')
      .evaluate(() => history.back());
    await expect(f.getByRole('heading', { name: 'Hospital dashboard' })).toBeVisible();
  });

  test('site that sends X-Frame-Options + CSP still renders in the frame', async ({ page }) => {
    const f = await open(page, FIX.cspXfo);
    await expect(f.getByRole('heading', { level: 1 })).toHaveText('Strict headers site');
  });

  test('service worker registration is blocked', async ({ page }) => {
    const f = await open(page, FIX.sw);
    await expect(f.locator('body')).toHaveAttribute('data-sw', 'blocked');
  });

  test('form submission is blocked', async ({ page }) => {
    const f = await open(page, FIX.forms);
    await f.getByLabel('Name').fill('test');
    await f.getByRole('button', { name: 'Send' }).click();
    await expect(f.getByText('Forms are turned off while reviewing.')).toBeVisible();
    await expect(f.getByRole('heading', { name: 'Get in touch' })).toBeVisible();
  });

  test('animated/canvas site renders and canvas can be tapped', async ({ page }) => {
    const f = await open(page, FIX.anim);
    await expect(f.locator('canvas')).toBeVisible();
    await send(page, { type: 'rec:start', baseline: 0 });
    await f.locator('canvas').click({ position: { x: 20, y: 20 } });
    const tap = await waitMsg(page, (m) => m.type === 'tap');
    if (tap.type !== 'tap' || tap.tap.fullAnchor.kind !== 'dom') throw new Error();
    expect(tap.tap.fullAnchor.elementDescriptor.tag).toBe('canvas');
  });

  test('proxy refuses requests without a review token', async ({ request }) => {
    const res = await request.get('http://localhost:8788/');
    expect(res.status()).toBe(403);
  });
});
