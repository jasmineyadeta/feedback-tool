// Embeds the built overlay bundle into the Worker as a TS string module.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const js = readFileSync(new URL('../../packages/overlay/dist/overlay.js', import.meta.url), 'utf8');
mkdirSync(new URL('./src/generated/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('./src/generated/overlay.ts', import.meta.url),
  `// Generated from packages/overlay — do not edit.\nexport const OVERLAY_JS = ${JSON.stringify(js)};\n`,
);
