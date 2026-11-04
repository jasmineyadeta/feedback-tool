# M3: `pnpm eval:anchors` — qwen3:14b adopted (87%), prompt v2

## What / why
- `scripts/eval-anchors.ts` runs fixture cases against the **real** local model (no mocks) and writes `docs/ANCHOR_EVAL.md` (D15: ≥80% to adopt). 23 cases: direct references, pointing ("this line here", "this one"), topic shifts (two checkpoints), scrolled screens, no-visual remarks (correct answer: none), plus **6 held-out cases on a different document** (a case study) whose vocabulary the prompt never mentions — to catch over-fitting the prompt to the eval.
- **Prompt v1 → v2** (`apps/web/lib/anchor-resolver/prompt.md`): v1 scored 8/17 = 47% (the model answered "none" with low confidence for clear references, and didn't know items were in reading order). v2 states the reading order, says to pick an item whenever the words mention or describe it, reserves `null` for overall remarks, and gives a concrete confidence scale.

## Result
- **20/23 = 87% → adopt qwen3:14b.** Held-out: 4/6. Validator rejections: 0. Mean 1.5 s per segment.
- All 3 misses answer "none" (→ placed on the page that was on screen, labelled "On screen") rather than a wrong line — the safe failure mode.
- The report reads the prompt version from the file header, so it can't drift.

## Acceptance covered
- `pnpm eval:anchors` (≥15 cases, ≥80% to adopt) → `docs/ANCHOR_EVAL.md`.

## Dependencies
- None.

## Process note (previous slice)
- The "M3: AI resolver" slice (commits `e6cff89`, `aa61929`) was committed directly on `main` because I didn't create a branch first; `merge-task` correctly refused, but my chained `git push` still published them. `pnpm verify` was green on exactly that tree before the push. History wasn't rewritten (no force-push). From this slice on, the branch is created before any edit and pushing happens only after a successful `merge-task`.

## Known limitations
- Synthetic transcripts. Held-out accuracy (67%) is lower than on the résumé set; real-recording quality is a manual check.
