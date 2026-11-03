import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { validatePdf } from '@/lib/server/pdf';

const f = (n: string) => new Uint8Array(readFileSync(`apps/web/test/fixtures/${n}`));

describe('validatePdf', () => {
  it('accepts a valid PDF and counts pages', async () => {
    expect(await validatePdf(f('resume-2p.pdf'))).toEqual({ ok: true, pages: 2 });
  });
  it('rejects non-PDF bytes even with a .pdf name', async () => {
    expect(await validatePdf(f('not-a-pdf.pdf'))).toMatchObject({ ok: false, code: 'not_pdf' });
  });
  it('rejects more than 30 pages', async () => {
    expect(await validatePdf(f('too-many-31p.pdf'))).toMatchObject({
      ok: false,
      code: 'too_many_pages',
    });
  });
  it('rejects oversize and empty files', async () => {
    expect(await validatePdf(new Uint8Array(16 * 1024 * 1024))).toMatchObject({
      ok: false,
      code: 'too_large',
    });
    expect(await validatePdf(new Uint8Array())).toMatchObject({ ok: false, code: 'empty' });
  });
  it('rejects a damaged PDF', async () => {
    expect(await validatePdf(new TextEncoder().encode('%PDF-1.4\ngarbage'))).toMatchObject({
      ok: false,
    });
  });
});
