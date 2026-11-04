// M3 spike: compare whisper word timestamps with the known phrase start times.
// Usage: node scripts/spike-compare.mjs <truth.json> <whisper verbose_json> [label]
import { readFileSync } from 'node:fs';

const [truthPath, resultPath, label = resultPath] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
const res = JSON.parse(readFileSync(resultPath, 'utf8'));
const words = res.segments
  .flatMap((s) => s.words ?? [])
  .map((w) => ({
    ...w,
    norm: w.word
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, ''),
  }))
  .filter((w) => w.norm);

let used = 0;
const rows = [];
for (const t of truth) {
  // Match the phrase's first TWO words in order, so "the" in "to the end" can't match "The contact".
  const [first, second] = t.text.toLowerCase().split(' ');
  const idx = words.findIndex(
    (w, i) => i >= used && w.norm === first && words[i + 1]?.norm === second,
  );
  if (idx < 0) {
    rows.push({ phrase: t.text, truth: t.startSec, got: null, errMs: null });
    continue;
  }
  used = idx + 1;
  const w = words[idx];
  rows.push({
    phrase: t.text,
    truth: +t.startSec.toFixed(2),
    got: w.start,
    errMs: Math.round((w.start - t.startSec) * 1000),
  });
}
const zeroLen = words.filter((w) => w.end - w.start <= 0).length;
const errs = rows.filter((r) => r.errMs !== null).map((r) => Math.abs(r.errMs));
console.log(`\n${label}`);
console.table(rows);
console.log(
  `words=${words.length} zero-length=${zeroLen} maxAbsErr=${Math.max(...errs)}ms meanAbsErr=${Math.round(errs.reduce((a, b) => a + b, 0) / errs.length)}ms text="${res.text.replace(/\s+/g, ' ').trim()}"`,
);
