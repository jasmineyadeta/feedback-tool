import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, createInvite, createPdfReview, signInNewOwner } from './helpers/owner';
import { closeList, fakeMic, setScript, startRecording, type Script } from './helpers/talk';

/** Sentence 1 is said in the first half second; sentence 2 far later, so any tap after ~1 s splits
 *  exactly between them (tap split: first word with start ≥ tap − 0.3 s). */
const TWO_SENTENCES: Script = {
  words: [
    ...'overall this resume reads really clearly'.split(' ').map((w, i) => ({
      w,
      start: i * 0.08,
      end: i * 0.08 + 0.07,
    })),
    ...'this heading needs a stronger verb'.split(' ').map((w, i) => ({
      w,
      start: 50 + i * 0.4,
      end: 50 + i * 0.4 + 0.3,
    })),
  ],
};

async function setup(browser: Browser, page: Page) {
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await signInNewOwner(owner);
  await createPdfReview(owner, { title: 'Talk review' });
  await owner.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
  const reviewId = owner.url().split('/').pop()!;
  const link = await createInvite(owner, 'Kai');
  await page.goto(link);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('[data-page="1"] .textLayer span').first()).toBeAttached();
  return { owner, reviewId, inviteLink: link };
}

test('record, tap, stop → the comments land in the list, split and saved', async ({
  browser,
  page,
}, info) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('dialog', { name: 'Before you record' })).toContainText(
    'turned into text on this computer',
  );
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('status', { name: 'Recording' })).toBeVisible();

  await page.waitForTimeout(1200);
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 120, y: 140 } });
  await expect(page.getByRole('button', { name: 'Tap 1' })).toBeVisible();
  await page.screenshot({ path: `test-results/shots/recording-${info.project.name}.png` });

  await setScript(page, TWO_SENTENCES);
  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await page.getByRole('button', { name: 'Stop' }).click();
  const cards = page.getByTestId('reviewer-comment');
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  await expect(page.getByText('Added 2 comments from your recording.')).toBeVisible();
  // The (mock) AI places the untapped sentence on the visible line sharing its words ("resume").
  await expect(cards.nth(0)).toContainText('Auto-placed');
  await expect(cards.nth(0)).toContainText('Overall this resume reads really clearly');
  await expect(cards.nth(1)).toContainText('Tapped');
  await expect(cards.nth(1)).toContainText('This heading needs a stronger verb');
  await page.screenshot({ path: `test-results/shots/recorded-list-${info.project.name}.png` });
  await saved;
  await expect(page.getByRole('button', { name: /^Comment \d$/ })).toHaveCount(2); // AI + tap

  // Consent was recorded server-side; drafts became saved comments with their source.
  const { data: inv } = await admin()
    .from('reviewer_invites')
    .select('audio_consent_at,id')
    .eq('review_id', s.reviewId)
    .single();
  expect(inv!.audio_consent_at).not.toBeNull();
  const { data: rows } = await admin()
    .from('comments')
    .select('state,anchor_source,transcript_original')
    .eq('invite_id', inv!.id)
    .order('sort_key');
  expect(rows).toEqual([
    {
      state: 'saved',
      anchor_source: 'ai',
      transcript_original: 'overall this resume reads really clearly',
    },
    {
      state: 'saved',
      anchor_source: 'tap',
      transcript_original: 'this heading needs a stronger verb',
    },
  ]);

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Here’s what we heard' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Comment \d$/ })).toHaveCount(2);
  await s.owner.context().close();
});

test('microphone blocked → clear message and a typed path', async ({ browser, page }) => {
  await fakeMic(page, { deny: true });
  const s = await setup(browser, page);
  await page.getByRole('button', { name: 'Record' }).click();
  await page
    .getByRole('dialog', { name: 'Before you record' })
    .getByRole('button', { name: 'Start recording' })
    .click();
  await expect(page.getByText(/microphone is blocked/i)).toBeVisible();
  await page.getByRole('button', { name: 'Type a comment' }).click();
  await expect(page.getByText('Tap the spot your comment is about.')).toBeVisible();
  await s.owner.context().close();
});

test('transcription failure keeps the audio, says so, and offers typing', async ({
  browser,
  page,
}) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await startRecording(page);
  await setScript(page, { fail: true });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText(/transcription is taking longer than usual/)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'Type a comment' })).toBeVisible();
  const { data: inv } = await admin()
    .from('reviewer_invites')
    .select('id')
    .eq('review_id', s.reviewId)
    .single();
  const { data: recs } = await admin()
    .from('recordings')
    .select('resolver_status,attempts,audio_file_key')
    .eq('invite_id', inv!.id);
  expect(recs).toHaveLength(1);
  expect(recs![0]).toMatchObject({ resolver_status: 'pending' });
  expect(recs![0]!.attempts).toBeGreaterThanOrEqual(1);
  const audio = await admin().storage.from('audio').download(recs![0]!.audio_file_key!);
  expect(audio.data?.size).toBeGreaterThan(0);
  await s.owner.context().close();
});

test('offline at stop: recording stays on the device and uploads when back online', async ({
  browser,
  page,
  context,
}) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await startRecording(page);
  await setScript(page, { text: 'the layout on this page feels crowded' });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText(/saved on this device and will upload/)).toBeVisible();
  const stored = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('ft-drafts');
          req.onsuccess = () => {
            const c = req.result.transaction('recordings').objectStore('recordings').count();
            c.onsuccess = () => resolve(c.result);
          };
        }),
    );
  expect(await stored()).toBe(1); // kept on the device until the server ACKs
  await context.setOffline(false);
  await expect(page.getByTestId('reviewer-comment')).toContainText(
    'The layout on this page feels crowded',
    { timeout: 20000 },
  );
  expect(await stored()).toBe(0); // removed after the ACK
  await s.owner.context().close();
});

test('list merge + move + edit; owner sees source, original transcript, and can play the clip', async ({
  browser,
  page,
}, info) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await startRecording(page);
  await page.waitForTimeout(1200);
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 120, y: 140 } });
  await setScript(page, TWO_SENTENCES);
  await page.getByRole('button', { name: 'Stop' }).click();
  const cards = page.getByTestId('reviewer-comment');
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  const openList = async () => {
    const listOpen = await page.getByRole('button', { name: 'Close', exact: true }).isVisible();
    const toggle = page.getByRole('button', { name: /^Comments \(/ });
    if (!listOpen && (await toggle.isVisible())) await toggle.click();
  };

  // Merge: words joined in order, the tapped anchor wins.
  await cards.nth(1).getByRole('button', { name: 'Merge with previous' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Tapped');
  await expect(cards.first()).toContainText(
    'Overall this resume reads really clearly This heading needs a stronger verb',
  );

  // Move: the list steps aside (phone), the reviewer taps page 2, the comment moves there.
  await cards.first().getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Tap the spot this comment is about.')).toBeVisible();
  await page.locator('[data-page="2"]').scrollIntoViewIfNeeded();
  await page.getByRole('region', { name: 'Page 2' }).click({ position: { x: 100, y: 120 } });
  await openList();
  await expect(cards.first()).toContainText('Page 2');

  // Edit the words in the list.
  await cards.first().getByRole('button', { name: 'Edit' }).click();
  await page
    .getByLabel('Your comment', { exact: true })
    .fill('Overall clear. The heading needs a stronger verb.');
  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await page.getByRole('button', { name: 'Save comment' }).click();
  await saved;
  await openList();
  await expect(cards.first()).toContainText('Overall clear. The heading needs a stronger verb.');
  await page.screenshot({ path: `test-results/shots/list-edit-${info.project.name}.png` });
  await closeList(page);
  await page.getByRole('button', { name: 'Submit' }).click();
  const sheet = page.getByRole('dialog', { name: 'Send your feedback' });
  await sheet.getByLabel('Your email').fill('kai@example.com');
  await sheet.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Thanks — your feedback was sent/)).toBeVisible();

  const o = s.owner;
  await o.setViewportSize(page.viewportSize()!);
  await o.goto(`/reviews/${s.reviewId}/feedback`);
  const openSheet = async () => {
    if (await o.getByRole('button', { name: /^Comments \(/ }).isVisible())
      await o.getByRole('button', { name: /^Comments \(/ }).click();
  };
  await openSheet();
  const card = o.getByTestId('feedback-comment').first();
  await expect(card).toContainText('Tapped');
  await expect(card).toContainText('Page 2');
  await expect(card).toContainText('Overall clear. The heading needs a stronger verb.');
  await card.getByText('Original transcript').click();
  await expect(card).toContainText(
    'overall this resume reads really clearly this heading needs a stronger verb',
  );

  const audioRes = o.waitForResponse(
    (r) => r.url().includes('/audio') && r.request().method() === 'GET',
  );
  await card.getByRole('button', { name: /Play/ }).click();
  const res = await audioRes;
  expect(res.status()).toBe(200);
  const { url } = (await res.json()) as { url: string };
  expect((await o.request.get(url)).status()).toBe(200); // the clip itself is reachable
  await o.screenshot({ path: `test-results/shots/owner-audio-${info.project.name}.png` });

  // After the 90-day purge the words stay; playing explains what happened.
  const { data: inv } = await admin()
    .from('reviewer_invites')
    .select('id')
    .eq('review_id', s.reviewId)
    .single();
  await admin().from('recordings').update({ audio_file_key: null }).eq('invite_id', inv!.id);
  await o.reload();
  await openSheet();
  await o.getByTestId('feedback-comment').first().getByRole('button', { name: /Play/ }).click();
  await expect(
    o.getByText('This recording was deleted after 90 days. The words are kept.'),
  ).toBeVisible();
  await o.context().close();
});

test('PDF: tapping a tap number while recording takes that tap back', async ({ browser, page }) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await startRecording(page);
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 120, y: 140 } });
  await page.getByRole('region', { name: 'Page 1' }).click({ position: { x: 120, y: 300 } });
  await expect(page.getByRole('button', { name: /^Tap \d$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Tap 1' }).click();
  await expect(page.getByRole('button', { name: /^Tap \d$/ })).toHaveCount(1);
  await s.owner.context().close();
});

test('PDF: untapped talk is pinned to the part of the page on screen; opening it shows the area', async ({
  browser,
  page,
}, info) => {
  await fakeMic(page);
  const s = await setup(browser, page);
  await startRecording(page);
  await page.waitForTimeout(1500); // a few snapshots of what's on screen
  await setScript(page, { text: 'lovely calm colours overall nice style' });
  await page.getByRole('button', { name: 'Stop' }).click();
  const card = page.getByTestId('reviewer-comment');
  await expect(card).toContainText('On screen', { timeout: 15000 });
  await closeList(page);

  const pin = page.getByRole('button', { name: 'Comment 1' });
  await expect(pin).toBeVisible();
  await expect(page.getByTestId('pdf-area-band')).toHaveCount(0); // just the pin until opened
  if (await page.getByRole('button', { name: /^Comments \(/ }).isVisible())
    await page.getByRole('button', { name: /^Comments \(/ }).click();
  await card.getByRole('button').first().click();
  await expect(page.getByTestId('pdf-area-band')).toHaveCount(1);
  await page.screenshot({ path: `test-results/shots/pdf-area-${info.project.name}.png` });
  await s.owner.context().close();
});
