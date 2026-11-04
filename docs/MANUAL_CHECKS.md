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

## M3 — Talk-through on real devices
- [ ] With `pnpm dev:phone` running, open a PDF reviewer link on the **iPhone (Safari)**. Tap **Record**, read the disclosure, **Start recording**, allow the mic.
  - Good: red dot + timer; Pause/Resume work; tapping the PDF shows numbered "Tap" markers.
- [ ] Say two sentences, tapping a heading before the second, then **Stop**.
  - Good: within ~10 s "Here's what we heard" shows two comments; the second is "Tapped" with your words (not reworded).
- [ ] Repeat on the **iPad**.
- [ ] Deny the mic once (Settings → Safari → Microphone → Deny), tap Record.
  - Good: "Your microphone is blocked…" with **Type a comment**.

## M4 — Live websites on a real iPhone
Use three real portfolio sites you know: at least one **Framer** and one **Webflow** (e.g. from `docs/test-portfolios.json`).
- [ ] With `pnpm dev:phone` running, create a **Website** review for each site on the laptop.
  - Good: the review page says **Live site** or **Screenshot mode** with a plain reason, within ~20 s.
- [ ] Open each reviewer link on the **iPhone (Safari)**. Scroll, open another page through the site's own navigation.
  - Good: the site looks like the real one; the grey bar shows the current page (e.g. "/about"); nothing says "blocked" or stays blank.
- [ ] **Add comment** → tap a heading → type → save. Go to another page and do it again.
  - Good: a numbered outline on what you tapped; the comment list shows both pages.
- [ ] **Record**, talk about something on screen, follow a link to another page, tap something there, talk again, **Stop**.
  - Good: links still navigate while recording; the preview shows two comments with the right pages ("Home page", "/work"…).
- [ ] Submit, then open the feedback on the laptop and click each comment.
  - Good: it jumps to the right page and outlines the right element. If a site has changed since, you see the screenshot from the review with the marker.
- [ ] For any site that came out in **Screenshot mode**: open its reviewer link.
  - Good: the yellow **Screenshot** label says it's a picture, not the live site; tapping it adds a comment.
