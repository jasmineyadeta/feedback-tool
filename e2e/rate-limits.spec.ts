import { expect, test } from '@playwright/test';
import { createInvite, createPdfReview, signInNewOwner } from './helpers/owner';

/**
 * M6 "rate limits verified": a real reviewer route answers 429 with a plain message once its
 * bucket is empty (submit: 10 per hour per link), and the limit is per link, not global.
 */
test('submit is rate limited per reviewer link', async ({ page }) => {
  await signInNewOwner(page);
  await createPdfReview(page, { title: 'Limits' });
  const token = (await createInvite(page, 'A')).split('/').pop()!;
  const other = (await createInvite(page, 'B')).split('/').pop()!;
  const submit = (t: string) => page.request.post(`/api/r/${t}/submit`, { data: { nope: 1 } });

  for (let i = 0; i < 10; i++) expect((await submit(token)).status()).toBe(400);
  const limited = await submit(token);
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toEqual({
    error: {
      code: 'rate_limited',
      message: "You're doing that a lot. Wait a minute and try again.",
    },
  });
  // Another reviewer's link is unaffected.
  expect((await submit(other)).status()).toBe(400);
});
