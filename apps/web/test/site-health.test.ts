import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { decideMode, proxyFailureMessage } = await import('@/lib/server/site-health');
const { fakePagePng } = await import('@/lib/server/adapters/screenshot');
const { explainMode, pickScreen } = await import('@/lib/site-mode');

const healthy = { overlayReady: true, fatalError: null, ms: 900 };

describe('decideMode (SPEC §3.1)', () => {
  it('is live when the overlay reports ready with no fatal error', () => {
    expect(decideMode({ ok: true, reason: null, platform: 'static' }, healthy, [])).toEqual({
      mode: 'live',
      reason: 'ok',
    });
  });
  it('falls back to Screenshot mode, with a reason, for each failure', () => {
    const p = { ok: true, reason: null, platform: 'framer' };
    expect(decideMode(p, healthy, ['framer']).reason).toBe('platform');
    expect(decideMode(p, null, []).reason).toBe('headless-failed');
    expect(decideMode(p, { ...healthy, fatalError: 'script-error' }, []).reason).toBe(
      'script-error',
    );
    expect(decideMode(p, { ...healthy, overlayReady: false }, []).reason).toBe('overlay-timeout');
    for (const h of [null, { ...healthy, overlayReady: false }])
      expect(decideMode(p, h, []).mode).toBe('screenshot');
  });
});

describe('owner-facing copy', () => {
  it('explains every mode in plain words and always says when it is a screenshot', () => {
    expect(explainMode({ mode: 'live', reason: 'ok', platform: 'static' }).title).toBe('Live site');
    for (const reason of [
      'platform',
      'overlay-timeout',
      'script-error',
      'headless-failed',
    ] as const) {
      const e = explainMode({ mode: 'screenshot', reason, platform: 'webflow' });
      expect(e.title).toBe('Screenshot mode');
      expect(e.body).toMatch(/screenshot of this page/);
    }
    expect(
      explainMode({ mode: 'screenshot', reason: 'platform', platform: 'webflow' }).body,
    ).toContain('Webflow');
  });
  it('turns proxy failures into a next step', () => {
    expect(proxyFailureMessage({ ok: false, reason: 'status-404' })).toBe(
      'That page returned an error (404). Check the address and try again.',
    );
    expect(proxyFailureMessage({ ok: false, reason: 'redirect-outside' })).toMatch(/final address/);
    expect(proxyFailureMessage({ ok: false, reason: 'weird' })).toMatch(/Check the address/);
  });
});

describe('pickScreen', () => {
  const screens = [
    { width: 1280, key: 'd' },
    { width: 390, key: 'm' },
  ];
  it('uses the phone screenshot on phones and the desktop one on wide screens', () => {
    expect(pickScreen(screens, 375)?.key).toBe('m');
    expect(pickScreen(screens, 820)?.key).toBe('d');
    expect(pickScreen(screens, 1920)?.key).toBe('d');
    expect(pickScreen([], 500)).toBeNull();
  });
});

describe('mock screenshot', () => {
  it('is a real PNG of the requested size', () => {
    const png = fakePagePng(40, 30);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([40, 30]);
  });
});
