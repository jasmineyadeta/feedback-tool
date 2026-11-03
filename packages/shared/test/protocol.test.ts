import { describe, expect, it } from 'vitest';
import { parseOverlayMessage, parseShellMessage, isAllowedAudioMime } from '../src';

describe('postMessage protocol', () => {
  it('accepts a valid overlay:ready', () => {
    expect(
      parseOverlayMessage({ ft: 1, type: 'overlay:ready', pagePath: '/', title: 'x' }),
    ).not.toBeNull();
  });
  it('rejects messages without the ft marker', () => {
    expect(parseOverlayMessage({ type: 'overlay:ready', pagePath: '/', title: 'x' })).toBeNull();
  });
  it('rejects unknown types and junk', () => {
    expect(parseShellMessage({ ft: 1, type: 'eval', code: 'alert(1)' })).toBeNull();
    expect(parseShellMessage('hello')).toBeNull();
    expect(parseShellMessage(null)).toBeNull();
  });
});

describe('audio mime allowlist', () => {
  it('accepts codecs params, rejects others', () => {
    expect(isAllowedAudioMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedAudioMime('audio/mp4')).toBe(true);
    expect(isAllowedAudioMime('video/mp4')).toBe(false);
    expect(isAllowedAudioMime('audio/ogg')).toBe(false);
  });
});
