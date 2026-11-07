# Sample resume for demos; proxy restart

Jas: "Both the resume is blank and the sample site is blank for me to test."

- **Blank site:** the dev proxy (`wrangler dev`) had stopped. It reloaded on a half-saved edit during the tone change ("Tone is not defined") and doesn't restart after a failed reload. It was restarted; nothing in the merged code was wrong (`pnpm verify` runs the same proxy). If a live site is ever blank in dev, check `~/.cache/feedback-tool/logs/proxy.log` and run `pnpm dev:stop && pnpm dev`.
- **Blank resume:** the demo review used the two-line test fixture (`resume-2p.pdf`). Added `docs/samples/sample-resume.pdf`, a realistic two-page resume for a made-up designer (Maya Okafor, example.com contact details), and pointed `docs/DEMO_SCRIPT.md` at it.
- Docs and asset only; no code, UI or test changes.
