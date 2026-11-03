import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('adapter registry (D30)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('MOCK_AI=1 forces mock AI adapters even when local is requested', async () => {
    vi.stubEnv('MOCK_AI', '1');
    vi.stubEnv('TRANSCRIBER', 'local');
    vi.stubEnv('ANCHOR_RESOLVER', 'local');
    const a = await import('@/lib/server/adapters');
    expect(a.transcriber().name).toBe('mock');
    expect(a.anchorResolver().name).toBe('mock');
  });

  it('mock transcriber reads an embedded fixture transcript', async () => {
    const { mockTranscriber } = await import('@/lib/server/adapters/transcriber');
    const bytes = new TextEncoder().encode('xxFT-TRANSCRIPT:{"text":"hello there world"}FT-ENDyy');
    const r = await mockTranscriber().transcribe(bytes, 'audio/webm');
    expect(r.text).toBe('hello there world');
    expect(r.words).toHaveLength(3);
  });

  it('mock mailer records messages', async () => {
    const { mockMailer, sentMail } = await import('@/lib/server/adapters/mailer');
    await mockMailer(undefined).send({ to: 'a@b.test', subject: 's', text: 't' });
    expect(sentMail.at(-1)?.subject).toBe('s');
  });

  it('local proxy host builds an __enter URL on the proxy origin', async () => {
    const { localProxyHost } = await import('@/lib/server/adapters/proxy-host');
    const h = localProxyHost('http://localhost:8787');
    expect(h.originFor('r1')).toBe('http://localhost:8787');
    const u = new URL(h.enterUrl('r1', 'tok', '/about'));
    expect(u.pathname).toBe('/__enter');
    expect(u.searchParams.get('p')).toBe('/about');
  });
});
