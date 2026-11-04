import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { ownerEmail } = await import('@/lib/server/reviewer');

const base = {
  to: 'jas@example.com',
  title: '',
  artifact: 'website' as const,
  link: 'http://app/reviews/1/feedback',
};

describe('owner "feedback is ready" email', () => {
  it('is link-only and names the artifact plainly', () => {
    const m = ownerEmail({ ...base, reviewerName: 'Sam' });
    expect(m.subject).toBe('Sam sent feedback on your site');
    expect(m.text).toContain('Read their feedback: http://app/reviews/1/feedback');
    expect(ownerEmail({ ...base, artifact: 'pdf', reviewerName: 'Sam' }).subject).toBe(
      'Sam sent feedback on your PDF',
    );
  });
  it('flattens self-reported names (no header injection) and escapes HTML', () => {
    const m = ownerEmail({ ...base, reviewerName: 'Eve\r\nBcc: x@evil.test <b>hi</b>' });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
  it('falls back when the name is empty', () => {
    expect(ownerEmail({ ...base, reviewerName: '  ' }).subject).toBe(
      'A reviewer sent feedback on your site',
    );
  });
});
