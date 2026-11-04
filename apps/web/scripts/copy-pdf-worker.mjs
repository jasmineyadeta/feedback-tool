// Copies the pdf.js worker into public/ so the browser loads it same-origin (no CDN, CSP-friendly).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const src = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'build/pdf.worker.min.mjs',
);
const out = path.join(import.meta.dirname, '..', 'public');
mkdirSync(out, { recursive: true });
copyFileSync(src, path.join(out, 'pdf.worker.min.mjs'));
