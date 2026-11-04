import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, createInvite, createPdfReview, signInNewOwner } from './helpers/owner';

/**
 * Talk-through e2e. Browsers in CI have no microphone, so MediaRecorder/getUserMedia are replaced in
 * the page with fakes whose "audio" is a webm header + a script for the mock transcriber
 * (`FT-TRANSCRIPT:{...}FT-END`, see apps/web/lib/server/adapters/transcriber.ts).
 */
type Script = {
  words?: { w: string; start: number; end: number }[];
  text?: string;
  fail?: boolean;
};

async function fakeMic(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript((deny) => {
    const w = window as unknown as { __ftScript: unknown; MediaRecorder: unknown };
    w.__ftScript = { text: 'default words for this recording' };
    // Define on the prototype: WebKit ignores assignment to the instance property.
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      configurable: true,
      value: async () => {
        if (deny) throw new DOMException('denied', 'NotAllowedError');
        return new MediaStream();
      },
    });
    class FakeRecorder {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: ((e: Event) => void) | null = null;
      static isTypeSupported(m: string) {
        return m.startsWith('audio/webm');
      }
      start() {
        this.state = 'recording';
      }
      pause() {
        this.state = 'paused';
      }
      resume() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        const marker = new TextEncoder().encode(
          `FT-TRANSCRIPT:${JSON.stringify(w.__ftScript)}FT-END`,
        );
        const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...marker]);
        this.ondataavailable?.({ data: new Blob([bytes], { type: 'audio/webm' }) });
        setTimeout(() => this.onstop?.(new Event('stop')), 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
  }, !!opts.deny);
}

const setScript = (page: Page, s: Script) =>
  page.evaluate((x) => ((window as unknown as { __ftScript: unknown }).__ftScript = x), s);

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

async function startRecording(page: Page) {
  await page.getByRole('button', { name: 'Record' }).click();
  const consent = page.getByRole('dialog', { name: 'Before you record' });
  if (await consent.isVisible().catch(() => false))
    await consent.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('status', { name: 'Recording' })).toBeVisible();
}

test('record, tap, stop → split preview → Looks good saves the comments', async ({
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
  await page.getByRole('button', { name: 'Stop' }).click();
  const preview = page.getByRole('dialog', { name: 'Here’s what we heard' });
  await expect(preview).toBeVisible({ timeout: 15000 });
  const cards = preview.getByTestId('proposed-comment');
  await expect(cards).toHaveCount(2);
  // The (mock) AI places the untapped sentence on the visible line sharing its words ("resume").
  await expect(cards.nth(0)).toContainText('Auto-placed');
  await expect(cards.nth(0).getByRole('textbox')).toHaveValue(
    'Overall this resume reads really clearly',
  );
  await expect(cards.nth(1)).toContainText('Tapped');
  await expect(cards.nth(1).getByRole('textbox')).toHaveValue('This heading needs a stronger verb');
  await page.screenshot({ path: `test-results/shots/split-preview-${info.project.name}.png` });

  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await preview.getByRole('button', { name: 'Looks good' }).click();
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
  const preview = page.getByRole('dialog', { name: 'Here’s what we heard' });
  await expect(preview).toBeVisible({ timeout: 20000 });
  await expect(preview.getByRole('textbox')).toHaveValue('The layout on this page feels crowded');
  expect(await stored()).toBe(0); // removed after the ACK
  await s.owner.context().close();
});

test('preview merge + re-anchor + edit; owner sees source, original transcript, and can play the clip', async ({
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
  const preview = page.getByRole('dialog', { name: 'Here’s what we heard' });
  const cards = preview.getByTestId('proposed-comment');
  await expect(cards).toHaveCount(2, { timeout: 15000 });

  // Merge: words joined in order, the tapped anchor wins.
  await cards.nth(1).getByRole('button', { name: 'Merge with previous' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Tapped');
  await expect(cards.first().getByRole('textbox')).toHaveValue(
    'Overall this resume reads really clearly This heading needs a stronger verb',
  );

  // Re-anchor: the sheet steps aside, the reviewer taps page 2, the sheet comes back.
  await cards.first().getByRole('button', { name: 'Re-anchor' }).click();
  await expect(page.getByText('Tap the spot this comment is about.')).toBeVisible();
  await page.locator('[data-page="2"]').scrollIntoViewIfNeeded();
  await page.getByRole('region', { name: 'Page 2' }).click({ position: { x: 100, y: 120 } });
  await expect(cards.first()).toContainText('Page 2');
  await cards
    .first()
    .getByRole('textbox')
    .fill('Overall clear. The heading needs a stronger verb.');
  await page.screenshot({ path: `test-results/shots/preview-edit-${info.project.name}.png` });

  const saved = page.waitForResponse((r) => r.url().includes('/sync') && r.status() === 200);
  await preview.getByRole('button', { name: 'Looks good' }).click();
  await saved;
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
