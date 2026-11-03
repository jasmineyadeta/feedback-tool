import 'server-only';
import { LIMITS } from '@ft/shared';

export type PdfCheck = { ok: true; pages: number } | { ok: false; message: string; code: string };

/** Server-side PDF validation (SPEC §3.1, §7): magic bytes, size, parseable, page count. */
export async function validatePdf(bytes: Uint8Array): Promise<PdfCheck> {
  if (bytes.byteLength === 0)
    return { ok: false, code: 'empty', message: 'That file is empty. Choose your PDF again.' };
  if (bytes.byteLength > LIMITS.pdfMaxBytes)
    return {
      ok: false,
      code: 'too_large',
      message: 'That PDF is larger than 15 MB. Export a smaller version and try again.',
    };
  const head = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!head.includes('%PDF-'))
    return {
      ok: false,
      code: 'not_pdf',
      message: "That file isn't a PDF. Export your resume or portfolio as PDF and try again.",
    };
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      useSystemFonts: false,
      disableFontFace: true,
      stopAtErrors: false,
    });
    const doc = await task.promise;
    const pages = doc.numPages;
    await task.destroy();
    if (pages < 1) return { ok: false, code: 'no_pages', message: 'That PDF has no pages.' };
    if (pages > LIMITS.pdfMaxPages)
      return {
        ok: false,
        code: 'too_many_pages',
        message: `That PDF has ${pages} pages. The limit is ${LIMITS.pdfMaxPages}.`,
      };
    return { ok: true, pages };
  } catch (e) {
    if (process.env.DEBUG_PDF) console.error('pdf parse failed', e);
    return {
      ok: false,
      code: 'unreadable',
      message:
        "We couldn't open that PDF. It may be damaged or password-protected. Try exporting it again.",
    };
  }
}
