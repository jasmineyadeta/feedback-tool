# Manual checks for Jas

Things automation can't cover (real devices, real mic). Each has steps and what "good" looks like. Tick when done.

**Simulator is fine for now (Jas, 2026-11-04).** Any check below can be done in the iOS Simulator instead of a real iPhone: open Xcode's Simulator, run `pnpm dev` (no tunnel needed, because the Simulator reaches `localhost`), and open the links in its Safari. Click to tap; the Simulator uses the Mac's microphone. Real-device checks are still worth doing before real reviewers use it (Phase B).

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

## M6 — Full review on the phone (see `docs/DEMO_SCRIPT.md`)
Done by the agent in the iOS Simulator (iPhone 17, Safari), 2026-11-04, with `pnpm dev`:
- [x] A PDF reviewer link opens and renders: coach mark, toolbar, zoom and "Page 1 of 2" (`docs/changelog/img/m6-simulator-pdf-iphone17.png`).
- [x] A real Framer site (`jason-ng.space`) was created as a Website review, came out **Live site**, and renders live through the proxy in Safari (`docs/changelog/img/m6-simulator-framer-iphone17.png`).

The agent can open pages in the Simulator but can't tap or talk in it. Left for Jas (Simulator or iPhone):
- [ ] Follow `docs/DEMO_SCRIPT.md` steps 3–4 end to end as the reviewer: typed comment, talk-through with your voice, submit, then read it as the owner.
  - Good: every step fits the screen, taps land where you meant, and every comment appears in the right place for the owner.
