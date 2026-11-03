# Machine check (Phase A)

Checked 2026-11-03 by the coding agent.

| Item | Result | Target (D32) |
|---|---|---|
| Chip | Apple M5 Pro (arm64) | Apple Silicon ✅ |
| RAM | 64 GB | ≥16 GB ✅ |
| Free disk | ~466 GB | ~20 GB ✅ |
| macOS | 27.0.1 | — |
| Homebrew | 7.0.12 | ✅ |
| Docker | 29.9.2, daemon running | ✅ |

## Installed via Homebrew
node@22 (22.23.4), pnpm (12.16.1), supabase CLI (3.0.0), whisper-cpp, ffmpeg, ollama, cloudflared, gitleaks.

## Model choices
- Whisper: `large-v3-turbo` (ggml), stored in `~/.cache/feedback-tool/models/`. The machine has headroom, so no fallback to `small`/`base` needed.
- Ollama anchor model: chosen by `pnpm eval:anchors` (see `docs/ANCHOR_EVAL.md`). With 64 GB RAM, 14B-class models run comfortably.
