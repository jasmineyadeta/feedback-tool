import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { admin, createSiteReview, signInNewOwner } from './helpers/owner';

/**
 * Every pinned comment is visible on the live site, not only tapped ones: "on screen" comments get
 * a numbered band beside the area the reviewer was looking at. Clicking a number on the page
 * selects that comment in the list.
 */
const SITE = 'http://localhost:4601/';
const view = (y: number, focus?: unknown) => ({
  kind: 'viewport',
  pageUrl: SITE,
  pagePath: '/',
  scroll: { x: 0, y },
  viewport: { w: 390, h: 700, dpr: 3 },
  visibleTextSample: '',
  ...(focus ? { focus } : {}),
});
const skillsHeading = {
  kind: 'dom',
  pageUrl: SITE,
  pagePath: '/',
  textQuote: { exact: 'Skills', prefix: '', suffix: '' },
  elementDescriptor: {
    tag: 'h2',
    role: null,
    ariaLabel: null,
    imgAlt: null,
    imgSrcBasename: null,
    headingContext: null,
  },
  cssPath: '#skills > h2',
  nthPath: '',
  rectDoc: { x: 0, y: 0, w: 100, h: 30 },
  viewport: { w: 390, h: 700, dpr: 3 },
  scroll: { x: 0, y: 0 },
  point: { xPct: 0.5, yPct: 0.5 },
};

test('on-screen comments show as numbered bands; clicking a number selects the comment', async ({
  page,
}, info) => {
  await signInNewOwner(page);
  await createSiteReview(page, { url: SITE, title: 'Markers' });
  const reviewId = page.url().split('/').pop()!;
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
  const comments = [
    { text: 'Lovely intro.', anchor: view(0) },
    { text: 'List the tools you use for each skill.', anchor: view(600, skillsHeading) },
  ];
  await a.from('comments').insert(
    comments.map((c, i) => ({
      review_id: reviewId,
      invite_id: inv!.id,
      state: 'saved',
      sort_key: i,
      pdf_page: null,
      page_path: '/',
      anchor_source: 'viewport',
      ...c,
    })),
  );

  await page.goto(`/reviews/${reviewId}/feedback`);
  await expect(page.getByTestId('site-path')).toHaveText('Home page');
  const site = page.frameLocator('[data-testid=site-frame]');
  await expect(site.getByRole('button', { name: 'Comment 1' })).toBeVisible();
  const two = site.getByRole('button', { name: 'Comment 2' });
  await expect(two).toBeAttached();

  // The band for comment 2 sits beside the Skills heading (the element that was mid-screen).
  const tops = await site.locator('#skills > h2').evaluate((h) => {
    const host = document.getElementById('__ft_root')!.shadowRoot!;
    const nums = [...host.querySelectorAll('.num')];
    const num = nums.find((n) => n.textContent === '2') as HTMLElement;
    return { heading: h.getBoundingClientRect().top + scrollY, badge: parseFloat(num.style.top) };
  });
  expect(Math.abs(tops.badge - tops.heading)).toBeLessThan(30);

  await two.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/shots/site-markers-${info.project.name}.png` });
  await two.click();
  const card = page.getByTestId('feedback-comment').filter({ hasText: 'tools you use' });
  await expect(card).toHaveClass(/bg-blue-50/);
  await expect(card).toBeInViewport();

  // (On a phone the marker opened the comment sheet.) Opening an on-screen comment from the list doesn't claim the page changed.
  await card.getByRole('button').first().click();
  await expect(page.getByTestId('locate-status')).toHaveAttribute('data-method', 'cssPath');
  await expect(page.getByText('changed since the review')).toHaveCount(0);
  // Markers stay visible after jumping to a comment.
  await expect(site.getByRole('button', { name: 'Comment 1' })).toBeAttached();
});
