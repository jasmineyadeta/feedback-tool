# M3 spike — whisper.cpp word-level timestamps (D14)

**Question:** does the local `whisper.cpp` server (large-v3-turbo) give word timings good enough to split a talk-through at taps and to line words up with the 1 s timeline snapshots? If not, D14 says switch to `faster-whisper`.

**Answer: yes — keep whisper.cpp, default settings (no VAD, no DTW).** No switch to faster-whisper.

## Method (reproducible)
1. `scripts/spike-make-audio.sh <dir>` — macOS `say` speaks 4 résumé-style sentences, placed with ffmpeg at known times (0.5 s, 4 s, 8 s, 12.5 s) in one 15 s track, then encoded as `iphone.m4a` (AAC in MP4, what Safari's MediaRecorder produces as `audio/mp4`) and `chrome.webm` (Opus).
2. `whisper-server --convert` (ffmpeg converts on the server), `POST /inference` with `response_format=verbose_json` → every segment has a `words[]` array with `start`/`end`. (`-ml 1 / -sow` from D14 isn't needed: verbose_json already returns words.)
3. `node scripts/spike-compare.mjs truth.json result.json` — finds each sentence's first two words and compares the start time with the known start.

## Results (2026-11-03, M5 Pro, large-v3-turbo)

| Setting | Format | Transcript | Max start error | Mean | Notes |
|---|---|---|---|---|---|
| **default** | iPhone `.m4a` | exact | **−500 ms** | −480 ms | consistently a little *early*; first 2–3 words of a sentence sometimes share one start time |
| **default** | Chrome `.webm` | exact | **−540 ms** | −505 ms | same as m4a |
| `--dtw large.v3.turbo` | both | exact | same as default | | `t_dtw` came back `-1` in server mode — no effect |
| `--vad` (Silero v5.1.2) | both | exact | **−6300 ms** | −3150 ms | server reports times on the *silence-removed* timeline — drift grows through the recording. Unusable. |

Speed: 15 s of audio transcribed in **0.8 s** including model load (`whisper-cli`, Metal).

## Decisions for M3
- Transcriber `local` adapter = `whisper-server --convert`, `verbose_json`, temperature 0, **no VAD, no DTW**.
- Tap split and timeline matching use a **±1 s tolerance**; the observed bias (≈0.5 s early at sentence starts) sits well inside it. No timing "correction" is applied — we keep whisper's numbers and document the bias.
- Words that share a start time keep their order; spans are built from word order, not from timestamps alone.

## Limits of this spike
- Synthetic speech, not a real Safari recording. The real-iPhone check stays in `docs/MANUAL_CHECKS.md` (M3: record on iPhone Safari and iPad).
- Clean audio. Noisy rooms and long pauses mid-sentence aren't covered; the M3 live-AI test (`pnpm test:live-ai`) re-checks with the fixture recordings.
