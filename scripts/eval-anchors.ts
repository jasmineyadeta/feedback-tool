/**
 * `pnpm eval:anchors` (D15, SPEC §5.2): runs the fixture cases against the REAL local model and
 * writes docs/ANCHOR_EVAL.md. A model is adopted only if ≥80% of cases are correct.
 * Each case is one untapped segment; `expect` lists, per checkpoint word, the acceptable eids
 * (null = "not about one visible thing" → viewport anchor is correct).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Timeline, TranscriptWord } from '@ft/shared';
import { ollamaAnchorResolver } from '../apps/web/lib/server/adapters/anchor-resolver';
import { validateSpans } from '../apps/web/lib/server/validate-spans';

const MODEL = process.env.ANCHOR_MODEL ?? 'qwen3:14b';
const URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const MIN_CONFIDENCE = 0.6;
const PROMPT_VERSION =
  /prompt (v\d+)/.exec(readFileSync('apps/web/lib/anchor-resolver/prompt.md', 'utf8'))?.[1] ?? '?';

const LINES: Record<string, string> = {
  a0: 'Ada Lovelace — Product Designer',
  a1: 'ada@example.com · London · portfolio: ada.design',
  a2: 'Summary: Designer focused on research-led product work for fintech',
  a3: 'Experience',
  a4: 'Senior Product Designer, Analytical Engines Ltd, 2022–present',
  a5: 'Led redesign of onboarding, raising activation by 18%',
  a6: 'Product Designer, Difference Co, 2019–2022',
  a7: 'Education: BSc Mathematics, University of London',
  a8: 'Skills: Figma, prototyping, usability testing, SQL',
};
/** Held-out document: a portfolio case study. None of its vocabulary appears in the prompt. */
const CASE_STUDY: Record<string, string> = {
  b0: 'Case study: Rebuilding checkout for Northwind',
  b1: 'Problem: 32% of mobile users abandoned at the payment step',
  b2: 'Research: 12 interviews and a two-week diary study',
  b3: 'Outcome: conversion up 9% in six weeks',
  b4: 'Next steps: test saved cards with returning users',
};

type Case = {
  name: string;
  /** 'held-out' cases use the case-study page and vocabulary the prompt never mentions. */
  doc?: 'resume' | 'held-out';
  kind: 'direct' | 'pointing' | 'topic-shift' | 'no-visual' | 'scrolling';
  /** Sentences, separated by " | " for a topic shift (each part's first word is a checkpoint). */
  say: string;
  expect: (string | null)[][];
  /** Visible line ids over time: [fromSeconds, ids][] (default: all lines, whole time). */
  screen?: [number, string[]][];
};

const CASES: Case[] = [
  {
    name: 'summary too long',
    kind: 'direct',
    say: 'the summary at the top is a bit long you could cut it to one line',
    expect: [['a2']],
  },
  {
    name: 'activation metric',
    kind: 'direct',
    say: 'i love the activation number that is a really strong result',
    expect: [['a5']],
  },
  {
    name: 'contact line',
    kind: 'direct',
    say: 'your email and location line looks fine to me',
    expect: [['a1']],
  },
  {
    name: 'senior role',
    kind: 'direct',
    say: 'for the senior role at analytical engines add the size of the team',
    expect: [['a4']],
  },
  {
    name: 'skills gap',
    kind: 'direct',
    say: 'the skills list should mention accessibility somewhere',
    expect: [['a8']],
  },
  {
    name: 'education placement',
    kind: 'direct',
    say: 'education is fine where it is but the degree name could be shorter',
    expect: [['a7']],
  },
  {
    name: 'name heading',
    kind: 'direct',
    say: 'your name at the very top could be a little bigger',
    expect: [['a0']],
  },
  {
    name: 'portfolio link',
    kind: 'direct',
    say: 'make sure the portfolio link is clickable in the pdf',
    expect: [['a1']],
  },
  {
    name: 'unclear phrase',
    kind: 'direct',
    say: 'i am not sure what research led means in that summary',
    expect: [['a2']],
  },
  {
    name: 'overall praise',
    kind: 'no-visual',
    say: 'overall this reads really well and i would happily send it',
    expect: [[null]],
  },
  {
    name: 'tailoring advice',
    kind: 'no-visual',
    say: 'i think you should tailor it a bit more for each company you apply to',
    expect: [[null]],
  },
  {
    name: 'mentoring idea',
    kind: 'no-visual',
    say: 'maybe add something about mentoring junior designers',
    expect: [[null, 'a4', 'a6']],
  },
  {
    name: 'summary then skills',
    kind: 'topic-shift',
    say: 'the summary is clear and focused | but the skills list is missing research methods',
    expect: [['a2'], ['a8']],
  },
  {
    name: 'dates then onboarding',
    kind: 'topic-shift',
    say: 'the difference co dates look right | the onboarding bullet should say over what timeframe',
    expect: [['a6'], ['a5']],
  },
  {
    name: 'job titles',
    kind: 'direct',
    say: 'the two job titles are formatted differently from each other',
    expect: [['a4', 'a6']],
  },
  {
    name: 'scrolled, "this line here"',
    kind: 'scrolling',
    say: 'okay this line here about onboarding is my favourite',
    screen: [[0, ['a5', 'a6', 'a7', 'a8']]],
    expect: [['a5']],
  },
  {
    name: 'interview count',
    doc: 'held-out',
    kind: 'direct',
    say: 'how many people did you actually talk to for this',
    expect: [['b2']],
  },
  {
    name: 'abandonment hook',
    doc: 'held-out',
    kind: 'direct',
    say: 'that drop off statistic is a great hook',
    expect: [['b1']],
  },
  {
    name: 'what next',
    doc: 'held-out',
    kind: 'direct',
    say: 'i would love to hear what you plan to try after this',
    expect: [['b4']],
  },
  {
    name: 'impact number',
    doc: 'held-out',
    kind: 'direct',
    say: 'nine percent in a month and a half is impressive',
    expect: [['b3']],
  },
  {
    name: 'title and role',
    doc: 'held-out',
    kind: 'direct',
    say: 'the title could say what your role on the project was',
    expect: [['b0']],
  },
  {
    name: 'general praise (held-out)',
    doc: 'held-out',
    kind: 'no-visual',
    say: 'this is a really nice piece of work overall',
    expect: [[null]],
  },
  {
    name: 'only one line on screen, "this one"',
    kind: 'pointing',
    say: 'this one is a bit vague to be honest',
    screen: [[0, ['a7']]],
    expect: [['a7']],
  },
];

function build(c: Case): { words: TranscriptWord[]; checkpoints: number[]; timeline: Timeline } {
  const words: TranscriptWord[] = [];
  const checkpoints: number[] = [];
  let t = 0.4;
  for (const part of c.say.split(' | ')) {
    checkpoints.push(words.length + Math.min(2, part.split(' ').length - 1));
    for (const w of part.split(' ')) {
      words.push({ w, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) });
      t += 0.35;
    }
    t += 0.8; // pause between parts
  }
  const lines = c.doc === 'held-out' ? CASE_STUDY : LINES;
  const visible = (sec: number) => {
    const s = c.screen ?? [[0, Object.keys(lines)]];
    return [...s].reverse().find(([from]) => sec >= from)![1];
  };
  const snapshots = Array.from({ length: Math.ceil(t) + 2 }, (_, i) => ({
    t: i * 1000,
    pagePath: '/page/1',
    scrollY: 0,
    elements: visible(i).map((eid) => ({
      eid,
      tag: 'pdf-line',
      text: lines[eid]!,
      alt: null,
      rectViewport: { x: 0, y: 0, w: 1, h: 1 },
      cssPath: '',
    })),
    viewportAnchor: { kind: 'pdf-page' as const, page: 1, visibleTextSample: '' },
  }));
  return { words, checkpoints, timeline: { taps: [], snapshots } };
}

async function main() {
  const resolver = ollamaAnchorResolver(URL, MODEL, 120_000);
  const rows: string[] = [];
  let correct = 0;
  let rejected = 0;
  let totalMs = 0;
  let heldOut = 0;
  let heldOutCorrect = 0;
  for (const c of CASES) {
    const { words, checkpoints, timeline } = build(c);
    const started = Date.now();
    let raw: unknown;
    try {
      raw = await resolver.resolve({
        firstWord: 0,
        lastWord: words.length - 1,
        words,
        snapshots: timeline.snapshots,
      });
    } catch (e) {
      raw = { error: e instanceof Error ? e.message : 'error' };
    }
    const ms = Date.now() - started;
    totalMs += ms;
    const v = validateSpans(raw, { first: 0, last: words.length - 1 }, words, timeline);
    if (!v.ok) rejected++;
    const got = checkpoints.map((w) => {
      if (!v.ok) return null;
      const s = v.spans.find((x) => w >= x.from && w < x.to)!;
      return s.eid && s.confidence >= MIN_CONFIDENCE ? s.eid : null;
    });
    const ok = got.every((g, i) => c.expect[i]!.includes(g));
    if (ok) correct++;
    if (c.doc === 'held-out') {
      heldOut++;
      if (ok) heldOutCorrect++;
    }
    const fmt = (x: (string | null)[]) => x.map((e) => e ?? 'none').join(' / ');
    rows.push(
      `| ${c.name}${c.doc === 'held-out' ? ' (held-out)' : ''} | ${c.kind} | ${c.expect.map(fmt).join(' → ')} | ${got.map((g) => g ?? 'none').join(' → ')}${v.ok ? '' : ` (rejected: ${v.reason})`} | ${ok ? '✅' : '❌'} | ${(ms / 1000).toFixed(1)} s |`,
    );
    console.info(
      `${ok ? 'PASS' : 'FAIL'} ${c.name} → ${got.join(', ')}${v.ok ? '' : ` [${v.reason}]`}`,
    );
  }
  const pct = Math.round((correct / CASES.length) * 100);
  const adopt = pct >= 80;
  const md = `# Anchor resolver eval (generated by \`pnpm eval:anchors\`)

Run: ${new Date().toISOString().slice(0, 10)} · model **${MODEL}** (local Ollama) · prompt \`apps/web/lib/anchor-resolver/prompt.md\` ${PROMPT_VERSION} · confidence threshold ${MIN_CONFIDENCE}.

## Result

- Correct: **${correct}/${CASES.length} = ${pct}%** (threshold 80%) → **${adopt ? `ADOPT ${MODEL}` : `DO NOT ADOPT ${MODEL}`}**.
- Held-out cases (a different document, vocabulary not used in the prompt's examples): **${heldOutCorrect}/${heldOut}**.
- Validator rejections: ${rejected} (rejected output falls back to the page on screen, which counts as "none").
- Mean latency per segment: ${(totalMs / CASES.length / 1000).toFixed(1)} s.

A case is correct when, at each checkpoint word, the placed line (or "none" when the model returns no eid, confidence < ${MIN_CONFIDENCE}, or the validator rejects) is one of the acceptable answers. "none" is the right answer for remarks that aren't about one visible thing.

## Cases

| Case | Kind | Expected | Got | | Time |
|---|---|---|---|---|---|
${rows.join('\n')}

## Notes

- Synthetic transcripts with a résumé page; real recordings are checked manually (docs/MANUAL_CHECKS.md).
- Changing the prompt or model requires re-running this eval and committing the new table.
`;
  writeFileSync('docs/ANCHOR_EVAL.md', md);
  console.info(
    `\n${correct}/${CASES.length} = ${pct}% → ${adopt ? 'adopt' : 'do not adopt'} (${MODEL})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
