import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { harnessEnabled } from '@/lib/server/proxy';

describe('test harness guard', () => {
  it('is off unless explicitly enabled on a localhost origin', () => {
    expect(harnessEnabled({})).toBe(false);
    expect(harnessEnabled({ ENABLE_TEST_HARNESS: '1' })).toBe(false);
    expect(
      harnessEnabled({ ENABLE_TEST_HARNESS: '1', APP_ORIGIN: 'https://feedback.example.com' }),
    ).toBe(false);
    expect(
      harnessEnabled({ ENABLE_TEST_HARNESS: '1', APP_ORIGIN: 'https://abc.trycloudflare.com' }),
    ).toBe(false);
    expect(harnessEnabled({ ENABLE_TEST_HARNESS: '0', APP_ORIGIN: 'http://localhost:3000' })).toBe(
      false,
    );
    expect(harnessEnabled({ ENABLE_TEST_HARNESS: '1', APP_ORIGIN: 'http://localhost:3100' })).toBe(
      true,
    );
  });
});
