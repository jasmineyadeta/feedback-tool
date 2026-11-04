# Manual checks for Jas

Things automation can't cover (real devices, real mic). Each has steps and what "good" looks like. Tick when done.

## M2 — PDF reviewer on a real iPhone
- [ ] Run `pnpm dev:phone`, create a PDF review on the laptop, open the reviewer link on the iPhone (Safari).
  - Good: PDF is sharp, pinch/scroll feel normal, zoom buttons work, "Page n of N" updates.
- [ ] Tap **Add comment**, tap a spot, type, save. Long-press to select text → **Comment on selection**.
  - Good: numbered marker at the tapped spot; selection comment shows the quoted text and a highlight.
- [ ] Turn on Airplane mode, add a comment, close Safari, reopen the link, turn Airplane mode off.
  - Good: the comment is still there after reopening and the status changes to "All changes saved" once online.
- [ ] Submit with name + email.
  - Good: thank-you banner; the owner email arrives in the local inbox (http://localhost:54324).
