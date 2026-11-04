import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, createInvite, createPdfReview, signInNewOwner } from './helpers/owner';

/** Owner creates a PDF review + one invite; returns the reviewer link. */
async function setup(browser: Browser, name = 'Sam') {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  const { userId } = await signInNewOwner(owner);
  await createPdfReview(owner, { title: 'Resume for review', context: 'Product design roles.' });
  await owner.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = owner.url().split('/').pop()!;
  const link = await createInvite(owner, name);
  return { owner, ownerId: userId, reviewId, link, token: link.split('/').pop()! };
}

async function openAsReviewer(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Resume for review' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  // Page 1 rendered (text layer present) before we tap on it.
  await expect(page.locator('[data-page="1"] .textLayer span').first()).toBeAttached();
}

async function addComment(page: Page, text: string, y = 120) {
  await page.getByRole('button', { name: 'Add comment' }).click();
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 90, y } });
  await page.getByLabel('Your comment', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Save comment' }).click();
}

const synced = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);

test('reviewer happy path: pin a comment, autosave, reload, submit; owner sees Submitted', async ({
  browser,
  page,
}, info) => {
  const shot = (name: string) =>
    page.screenshot({ path: `test-results/shots/${name}-${info.project.name}.png` });
  const s = await setup(browser);
  await openAsReviewer(page, s.link);
  const saved = synced(page);
  await addComment(page, 'The summary is strong — lead with it.');
  await saved;
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  await page.getByText('Ada Lovelace').first().waitFor();
  await page.getByRole('button', { name: 'Add comment' }).click();
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 200, y: 260 } });
  await page.getByLabel('Your comment', { exact: true }).fill('Add dates to this role.');
  await shot('reviewer-compose');
  await page.getByRole('button', { name: 'Save comment' }).click();

  await page.getByRole('button', { name: 'Submit' }).click();
  const sheet = page.getByRole('dialog', { name: 'Send your feedback' });
  await expect(sheet.getByLabel('Your name')).toHaveValue('Sam');
  await sheet.getByLabel('General note (optional)').fill('Overall clear and well organised.');
  await sheet.getByLabel('Your email').fill('sam@example.com');
  await shot('reviewer-submit');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Thanks — your feedback was sent/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Thanks — your feedback was sent/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comment 2' })).toBeVisible();
  await shot('reviewer-submitted');
  await expect(page.getByRole('button', { name: 'Add comment' })).toHaveCount(0);

  await s.owner.reload();
  await expect(s.owner.getByText('Submitted')).toBeVisible();
  // Submitted invites are read-only on the server too.
  const late = await page.request.post(`/api/r/${s.token}/sync`, {
    data: { ops: [{ op: 'delete', clientId: 'general-note' }] },
  });
  expect(late.status()).toBe(409);
  await s.owner.context().close();
});

test('refresh mid-draft restores unsynced comments, and they sync once the server is reachable', async ({
  browser,
  page,
}) => {
  const s = await setup(browser);
  await openAsReviewer(page, s.link);
  await page.route('**/sync', (r) => r.abort('internetdisconnected'));
  await addComment(page, 'Typo in the second bullet.');
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  await page.waitForTimeout(1500); // debounce elapsed; the sync attempt failed

  await page.reload();
  await page
    .getByRole('button', { name: 'Got it' })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();

  const saved = synced(page);
  await page.unroute('**/sync');
  await saved; // replayed from IndexedDB on load or by the retry timer
  const { count } = await admin()
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', s.reviewId);
  expect(count).toBe(1);
  await s.owner.context().close();
});

test('offline save queues on the device and syncs when back online', async ({
  browser,
  page,
  context,
}) => {
  const s = await setup(browser);
  await openAsReviewer(page, s.link);
  await context.setOffline(true);
  await addComment(page, 'Offline note about the header.');
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  const saved = synced(page);
  await context.setOffline(false);
  await saved;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  await s.owner.context().close();
});

test('revoked and unknown links show the same not-found page with a 404', async ({
  browser,
  page,
}) => {
  const s = await setup(browser);
  const ok = await page.goto(s.link);
  expect(ok?.status()).toBe(200);
  await s.owner.getByRole('button', { name: 'Revoke' }).click();
  // exact: the row's buttons read "RevokeDelete", which a loose match would accept too early.
  await expect(s.owner.getByText('Revoked', { exact: true })).toBeVisible();

  const revoked = await page.goto(s.link);
  expect(revoked?.status()).toBe(404);
  await expect(page.getByText('This review link isn’t available')).toBeVisible();
  const revokedHtml = (await page.content()).replace(/\/r\/[^"]+/g, '');

  const unknown = await page.goto('/r/' + 'x'.repeat(43));
  expect(unknown?.status()).toBe(404);
  await expect(page.getByText('This review link isn’t available')).toBeVisible();
  expect((await page.content()).replace(/\/r\/[^"]+/g, '').length).toBe(revokedHtml.length);

  const api = await page.request.post(`/api/r/${s.token}/sync`, {
    data: { ops: [{ op: 'delete', clientId: 'abcdef' }] },
  });
  expect(api.status()).toBe(404);
  await s.owner.context().close();
});

test('one reviewer link cannot touch another reviewer’s comments', async ({ browser, page }) => {
  const s = await setup(browser, 'Ana');
  await s.owner.getByLabel(/Reviewer name/).fill('Ben');
  await s.owner.getByRole('button', { name: 'Create reviewer link' }).click();
  await expect(s.owner.getByLabel('Reviewer link')).not.toHaveValue(s.link);
  const linkB = await s.owner.getByLabel('Reviewer link').inputValue();
  const tokenB = linkB.split('/').pop()!;
  const comment = {
    clientId: 'shared-id-1',
    text: 'From Ana',
    anchor: null,
    general: true,
    sortKey: 1,
  };
  const a = await page.request.post(`/api/r/${s.token}/sync`, {
    data: { ops: [{ op: 'upsert', comment }] },
  });
  expect(a.status()).toBe(200);
  // Same clientId from B's link: deletes/overwrites only within B's own invite.
  await page.request.post(`/api/r/${tokenB}/sync`, {
    data: { ops: [{ op: 'delete', clientId: 'shared-id-1' }] },
  });
  await page.request.post(`/api/r/${tokenB}/sync`, {
    data: { ops: [{ op: 'upsert', comment: { ...comment, text: 'From Ben' } }] },
  });
  const { data } = await admin()
    .from('comments')
    .select('text,invite_id')
    .eq('review_id', s.reviewId)
    .order('text');
  expect(data?.map((r) => r.text)).toEqual(['From Ana', 'From Ben']);
  expect(new Set(data?.map((r) => r.invite_id)).size).toBe(2);
  await s.owner.context().close();
});

test('another owner cannot open or delete my review; deleting it removes the stored PDF', async ({
  browser,
}) => {
  const s = await setup(browser);
  const other = await (await browser.newContext()).newPage();
  await signInNewOwner(other);
  const view = await other.goto(`/reviews/${s.reviewId}`);
  expect(view?.status()).toBe(404);
  const del = await other.request.delete(`/api/reviews/${s.reviewId}`, {
    data: { confirm: 'delete' },
  });
  expect(del.status()).toBe(404);

  const store = admin().storage.from('pdfs');
  expect((await store.list(s.ownerId)).data?.map((f) => f.name)).toContain(`${s.reviewId}.pdf`);
  await s.owner.getByRole('button', { name: 'Delete review' }).click();
  await s.owner.getByLabel('Type delete to confirm').fill('delete');
  await s.owner.getByRole('button', { name: 'Delete forever' }).click();
  await s.owner.waitForURL('**/reviews');
  expect((await store.list(s.ownerId)).data?.map((f) => f.name) ?? []).not.toContain(
    `${s.reviewId}.pdf`,
  );
  expect((await s.owner.goto(s.link))?.status()).toBe(404);
  await other.context().close();
  await s.owner.context().close();
});

test('full loop: owner sees only submitted feedback, jumps to an anchor, marks it addressed', async ({
  browser,
  page,
}, info) => {
  const s = await setup(browser, 'Priya');
  await openAsReviewer(page, s.link);
  let saved = synced(page);
  await addComment(page, 'Strong opening line.');
  await saved;

  // Drafts are invisible to the owner until the reviewer submits (D20).
  await s.owner.goto(`/reviews/${s.reviewId}/feedback`);
  await expect(s.owner.getByText('No feedback yet.')).toBeVisible();

  // Second comment on page 2, so navigate-to-anchor has to scroll.
  await page.locator('[data-page="2"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-page="2"] .textLayer span').first()).toBeAttached();
  saved = synced(page);
  await page.getByRole('button', { name: 'Add comment' }).click();
  await page.getByRole('region', { name: 'Page 2' }).click({ position: { x: 120, y: 200 } });
  await page.getByLabel('Your comment', { exact: true }).fill('Page two needs a heading.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await saved;
  await page.getByRole('button', { name: 'Submit' }).click();
  const sheet = page.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('priya@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Thanks — your feedback was sent/)).toBeVisible();

  const o = await (await browser.newContext({ ...info.project.use })).newPage();
  const { data: link } = await admin().auth.admin.generateLink({
    type: 'magiclink',
    email: (await admin().auth.admin.getUserById(s.ownerId)).data.user!.email!,
  });
  await o.goto(`/auth/confirm?token_hash=${link.properties!.hashed_token}&next=/reviews`);
  await o.waitForURL('**/reviews');
  await o.goto(`/reviews/${s.reviewId}`);
  await o.getByRole('link', { name: /Open feedback \(1\)/ }).click();
  await o.waitForURL(/\/feedback$/);
  await expect(o.locator('[data-page="1"] .textLayer span').first()).toBeAttached();

  if (await o.getByRole('button', { name: /^Comments \(/ }).isVisible())
    await o.getByRole('button', { name: /^Comments \(/ }).click();
  const second = o.getByTestId('feedback-comment').filter({ hasText: 'Page two needs a heading.' });
  await expect(second).toContainText('Priya (self-reported)');
  await second.getByRole('button').first().click();
  const marker = o.getByRole('button', { name: 'Comment 2' });
  await expect(marker).toHaveClass(/animate-pulse/);
  await expect(marker).toBeInViewport();
  await expect(o.getByText('Page 2 of 2')).toBeVisible();
  await o.screenshot({ path: `test-results/shots/owner-feedback-${info.project.name}.png` });

  if (await o.getByRole('button', { name: /^Comments \(/ }).isVisible())
    await o.getByRole('button', { name: /^Comments \(/ }).click();
  const patched = o.waitForResponse((r) => r.url().includes('/comments/') && r.status() === 200);
  await second.getByLabel('Mark addressed').check();
  await expect(second.getByLabel('Mark addressed')).toBeChecked();
  await patched;
  await o.reload();
  if (await o.getByRole('button', { name: /^Comments \(/ }).isVisible())
    await o.getByRole('button', { name: /^Comments \(/ }).click();
  await expect(
    o
      .getByTestId('feedback-comment')
      .filter({ hasText: 'Page two needs a heading.' })
      .getByLabel('Mark addressed'),
  ).toBeChecked();
  await o.context().close();
  await s.owner.context().close();
});
