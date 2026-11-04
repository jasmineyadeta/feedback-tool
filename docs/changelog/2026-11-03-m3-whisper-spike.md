# M3: whisper.cpp word-timestamp spike — keep whisper.cpp

## What / why
SPEC §8 M3 starts with a spike: are whisper.cpp word timestamps usable on iPhone `audio/mp4`? Result: yes (≤0.54 s early at sentence starts, exact transcript, 0.8 s for 15 s audio). VAD and DTW were tried and rejected. Full write-up: `docs/spikes/M3-whisper-word-timestamps.md`.

## Files
- `scripts/spike-make-audio.sh` — builds test recordings with speech at known times (iPhone-style AAC `.m4a` + Chrome-style Opus `.webm`).
- `scripts/spike-compare.mjs` — scores whisper's word start times against the known times.

## Acceptance covered
- M3 spike checkbox.

## Dependencies
- None. Downloaded the Silero VAD model (885 KB, free, from the official whisper.cpp Hugging Face page) to `~/.cache/feedback-tool/models/` for the comparison only; the app does not use it.

## Known limitations
- Synthetic speech; a real iPhone recording check remains a manual check.
