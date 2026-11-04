# M3: AI anchor placement + validator (local Ollama)

## What / why
- **AI pass** (`resolveWithAI`, SPEC §5.2 steps 2–4): after the tap split, each *untapped* segment is sent to the `AnchorResolver` with its words (indexed) and the timeline snapshots overlapping it ±2 s. The model returns only word indices + an `eid` + confidence. **Tapped segments are never sent** (tap overrides AI).
- **Validator** (`lib/server/validate-spans.ts`, mandatory per CLAUDE.md): schema; spans in order, contiguous, non-overlapping, covering exactly the segment; every `eid` visible in a snapshot within the span's window ±2 s. Any failure → that segment's AI output is discarded, an `ai_anchor_rejected` event is logged with the reason only, and the viewport anchor is used. Confidence < 0.6 or `eid: null` → viewport anchor. Comment text is always rebuilt from the original words — the model can't reword.
- **Local resolver** (`ollamaAnchorResolver`): Ollama `/api/chat`, `qwen3:14b` (env `ANCHOR_MODEL`), structured JSON output, temperature 0, thinking off, 60 s timeout. Prompt lives in `apps/web/lib/anchor-resolver/prompt.md` (v1, versioned in a header comment). Input is compact: segment words + de-duplicated snapshots (≤12, ≤40 lines each).
- **LLM down/slow**: the resolver error fails the attempt so the recording retries with backoff (audio kept, "taking longer" message). From the 3rd attempt, comments are placed without AI ("On screen") so the reviewer isn't stuck.
- `pnpm test:live-ai` gains a real-Ollama check (validator passes; picks the right line). One run: 5.6 s.

## Acceptance covered
- ✅ Validator rejects reworded / missing / duplicated spans — property tests with fast-check (`validate-spans.test.ts`): random valid partitions accepted; gaps, duplicates, overlap, reordering, out-of-range, reversed, invented/out-of-window eids, non-schema (incl. text instead of indices) rejected.
- ✅ Tap overrides AI — a resolver that tries to claim every word is only called for the untapped segment, its over-reach is rejected, and the tap anchor stands.

## Dependencies
- None (fast-check was already a dev dependency).

## Known limitations
- `pnpm eval:anchors` (≥15 cases, ≥80% to adopt the model) is the next slice; until then `qwen3:14b` is provisional (D15).
- Preview re-anchor and merge still to come.
