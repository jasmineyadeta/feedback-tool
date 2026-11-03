import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ currentUser: vi.fn() }));
import { devShortcutEnabled, safeNext } from '@/lib/server/auth';

describe('dev sign-in shortcut guard (D31)', () => {
  it('is enabled only in development', () => {
    expect(devShortcutEnabled('development')).toBe(true);
    for (const e of ['production', 'test', undefined, 'Development'])
      expect(devShortcutEnabled(e)).toBe(false);
  });
});

describe('safeNext', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNext('/reviews/1')).toBe('/reviews/1');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', null, undefined])
      expect(safeNext(bad)).toBe('/reviews');
  });
});
