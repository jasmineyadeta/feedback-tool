import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { admin, createPdfReview, createSiteReview, signInNewOwner } from './helpers/owner';

/**
 * SPEC §3.3: the owner can move an auto-placed comment (`anchor_source = owner_moved`). The reviewer's
 * own taps can't be moved, and the reviewer's words never change. Reviewer comments are seeded
 * directly so this test is only about the owner side.
 */
async function seed(reviewId: string, comments: Record<string, unknown>[]) {
  const a = admin();
  const { data: inv } = await a
    .from('reviewer_invites')
    .insert({
      review_id: reviewId,
      token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      reviewer_name: 'Mo',
    })
    .select('id')
    .single();
  const { data } = await a
    .from('comments')
    .insert(
      comments.map((c, i) => ({
        review_id: reviewId,
        invite_id: inv!.id,
        state: 'saved',
        sort_key: i,
        pdf_page: null,
        page_path: null,
        ...c,
      })),
    )
    .select('id,text');
  return { inviteId: inv!.id as string, ids: data!.map((d) => d.id as string) };
}

async function openList(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /^Comments \(/ }).click();
}

test('owner moves an auto-placed PDF comment; the reviewer’s tap has no Move', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'webkit-iphone';
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Move PDF' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = page.url().split('/').pop()!;
  const { ids } = await seed(reviewId, [
    {
      text: 'The summary is too long.',
      anchor: { kind: 'pdf-page', page: 1 },
      anchor_source: 'viewport',
      pdf_page: 1,
    },
    {
      text: 'Nice heading.',
      anchor: {
        kind: 'pdf',
        page: 1,
        rectPdf: { x: 100, y: 60, w: 40, h: 20 },
        point: { xPct: 0.2, yPct: 0.1 },
      },
      anchor_source: 'tap',
      pdf_page: 1,
    },
  ]);

  await page.goto(`/reviews/${reviewId}/feedback`);
  await openList(page, mobile);
  const onScreen = page.getByTestId('feedback-comment').filter({ hasText: 'too long' });
  await expect(onScreen).toContainText('On screen');
  await expect(
    page.getByTestId('feedback-comment').filter({ hasText: 'Nice heading' }).getByText('Move'),
  ).toHaveCount(0);

  await onScreen.getByRole('button', { name: /^Move comment/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tap the new spot' })).toBeVisible();
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page.screenshot({ path: `test-results/shots/owner-move-pick-${info.project.name}.png` });
  const saved = page.waitForResponse((r) => r.url().includes(`/comments/${ids[0]}`) && r.ok());
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 120, y: 300 } });
  await saved;

  await openList(page, mobile);
  await expect(onScreen).toContainText('Moved by you');
  await expect(onScreen).toContainText('The summary is too long.');
  await page.screenshot({ path: `test-results/shots/owner-move-done-${info.project.name}.png` });

  const { data: row } = await admin()
    .from('comments')
    .select('text,anchor,anchor_source,pdf_page')
    .eq('id', ids[0]!)
    .single();
  expect(row).toMatchObject({
    text: 'The summary is too long.',
    anchor_source: 'owner_moved',
    pdf_page: 1,
    anchor: { kind: 'pdf', page: 1 },
  });
  const { data: ev } = await admin()
    .from('review_events')
    .select('meta')
    .eq('review_id', reviewId)
    .eq('type', 'comment_moved');
  expect(ev).toEqual([{ meta: { from: 'viewport' } }]);
});

test('owner moves an auto-placed website comment onto an element; Escape cancels', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'webkit-iphone';
  await signInNewOwner(page);
  await createSiteReview(page, { url: 'http://localhost:4601/', title: 'Move site' });
  const reviewId = page.url().split('/').pop()!;
  await seed(reviewId, [
    {
      text: 'Say who you design for.',
      anchor: {
        kind: 'viewport',
        pageUrl: 'http://localhost:4601/',
        pagePath: '/',
        scroll: { x: 0, y: 0 },
        viewport: { w: 390, h: 700 },
        visibleTextSample: '',
      },
      anchor_source: 'ai',
      page_path: '/',
    },
  ]);
  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  const site = page.frameLocator('[data-testid=site-frame]');
  const card = page.getByTestId('feedback-comment').filter({ hasText: 'design for' });

  await openList(page, mobile);
  await card.getByRole('button', { name: /^Move comment/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Tap the new spot')).toHaveCount(0);

  await openList(page, mobile);
  await card.getByRole('button', { name: /^Move comment/ }).click();
  await expect(page.locator('[data-testid=site-frame]')).toBeVisible();
  await expect(site.locator('html[data-ft-capture]')).toBeAttached();
  const saved = page.waitForResponse((r) => r.url().includes('/comments/') && r.ok());
  await site.getByRole('heading', { name: 'Product designer crafting calm tools' }).click();
  await saved;

  await openList(page, mobile);
  await expect(card).toContainText('Moved by you');
  const { data } = await admin()
    .from('comments')
    .select('anchor,anchor_source')
    .eq('review_id', reviewId)
    .single();
  expect(data!.anchor_source).toBe('owner_moved');
  expect(data!.anchor).toMatchObject({
    kind: 'dom',
    pagePath: '/',
    pageUrl: 'http://localhost:4601/',
  });
  expect(JSON.stringify(data!.anchor)).not.toContain('8788'); // never the proxy host
});

test('the server refuses moving a tapped comment, a wrong anchor kind, or someone else’s comment', async ({
  browser,
  page,
}) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Refuse' });
  await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = page.url().split('/').pop()!;
  const { ids } = await seed(reviewId, [
    { text: 'a', anchor: { kind: 'pdf-page', page: 1 }, anchor_source: 'ai', pdf_page: 1 },
    {
      text: 'b',
      anchor: {
        kind: 'pdf',
        page: 1,
        rectPdf: { x: 60, y: 60, w: 40, h: 20 },
        point: { xPct: 0.1, yPct: 0.1 },
      },
      anchor_source: 'tap',
    },
  ]);
  const patch = (p: Page, id: string, anchor: unknown) =>
    p.request.patch(`/api/reviews/${reviewId}/comments/${id}`, { data: { anchor } });
  const pdf = {
    kind: 'pdf',
    page: 1,
    rectPdf: { x: 280, y: 380, w: 40, h: 20 },
    point: { xPct: 0.5, yPct: 0.5 },
  };

  expect((await patch(page, ids[1]!, pdf)).status()).toBe(400); // reviewer's own tap
  expect((await patch(page, ids[0]!, { ...pdf, page: 9 })).status()).toBe(400); // no page 9
  expect(
    (
      await patch(page, ids[0]!, {
        kind: 'screenshot',
        pagePath: '/',
        imageKey: 'entry-390',
        point: { xPct: 0.1, yPct: 0.1 },
      })
    ).status(),
  ).toBe(400); // wrong kind for a PDF

  const other = await browser.newContext();
  const stranger = await other.newPage();
  await signInNewOwner(stranger);
  expect((await patch(stranger, ids[0]!, pdf)).status()).toBe(404);
  await other.close();

  expect((await patch(page, ids[0]!, pdf)).status()).toBe(200);
  const { data } = await admin().from('comments').select('text').eq('id', ids[0]!).single();
  expect(data!.text).toBe('a');
});
