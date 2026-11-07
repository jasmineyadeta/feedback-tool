# Demo script: a full review on your phone (Phase A, local)

About 15 minutes. Everything runs on your Mac. Your phone reaches it through two free Cloudflare "quick tunnels" (no account). Nothing is deployed.

## Before you start (once)
- `pnpm setup` has run. Re-running it is safe.
- Docker Desktop is open (local Supabase runs in it).
- Your phone and Mac are online. They don't need to be on the same Wi-Fi.

## Quicker: iOS Simulator instead of your iPhone
Run `pnpm dev` instead of `pnpm dev:phone`. Open Xcode's **Simulator** (iPhone), and use `http://localhost:3000` everywhere below: the Simulator can reach your Mac directly, so no tunnels are needed. Click to tap; the Simulator uses your Mac's microphone.

## 1. Start everything
```
pnpm dev:phone
```
- Wait for **App tunnel** and **Proxy tunnel** lines and a QR code. The first start can take a minute while the speech and AI models load.
- The app address looks like `https://something.trycloudflare.com`. It changes every time you run `pnpm dev:phone`, so old links stop working.

## 2. Create a review (as the owner, on your Mac)
1. Open the **App tunnel** address in your Mac's browser. Use it rather than `localhost`: links you create use this address.
2. Sign in. The local inbox for magic links is http://127.0.0.1:54324. In dev there's also **Sign in as Jas (dev only)**.
3. **New review**:
   - **Website**: paste a public portfolio address, for example one from `docs/test-portfolios.json`. Wait for **Live** or **Screenshot mode**, and read why.
   - **PDF**: upload a resume (up to 30 pages).
4. **Invite a reviewer**, type a name and **Copy link**. The link is shown only once.

## 3. Review it (as the reviewer, on your iPhone)
1. Send yourself the link (AirDrop, Notes or a text) and open it in Safari.
2. Read the coach mark, then **Got it**.
3. **Typed comment**: **Add comment**, tap a spot, type, **Save comment**.
4. **Talk-through**:
   - Tap **Record**, read the consent sheet (it links to the privacy notice), then **Start recording**.
   - Scroll and talk. Tap the parts you mean as you say "this" or "here".
   - On a website you can follow links to other pages while recording. **Pause** lets you use the site normally.
   - Tap **Stop**. Within a few seconds the comments appear in **Your comments**, highlighted (on a phone the list opens). Use **Edit**, **Move**, **Merge with previous** or **Delete** on any of them.
5. Optional: lock the phone or switch to airplane mode for a moment. Unsaved work is kept on the phone and sent when you're back.
6. **Submit**: add a general note if you like, your name and email, **Submit**.

## 4. Read the feedback (as the owner, on your Mac)
1. The "feedback is ready" email is in the local inbox (http://127.0.0.1:54324). It has only a link.
2. Open the review. The reviewer's status is **Submitted**.
3. Open **Feedback**:
   - Click a comment to jump to its spot.
   - On websites, a note says when the page has changed since the review, and shows the screenshot from that time if needed.
   - Play the recording.
   - **Mark addressed**.

## 5. Stop
```
pnpm dev:stop
```
- This stops the tunnels, the app, the proxy, Supabase and the model servers.

## If something goes wrong
| What you see | What to do |
|---|---|
| A tunnel line never appears | Run `pnpm dev:stop`, then `pnpm dev:phone` again. Quick tunnels sometimes fail to start. |
| The phone says the link isn't found | The tunnel address changed. Make a new invite link from the new App tunnel address. |
| A website shows **Screenshot mode** | The site blocked being shown live. The review still works on a labelled picture. |
| **We couldn't transcribe that recording** | The audio is saved. Type the comments instead, and check `pnpm dev` started whisper (see its output). |
| A site never loads on the phone | After 15 seconds the page says so. Try another site from `docs/test-portfolios.json`. |

## What to look for (the manual check)
- Coach mark, comment, recording, preview and submit all fit the iPhone screen. Nothing hides behind the keyboard or the home bar.
- Taps land where you meant.
- After submit, every comment is on the owner's side and in the right place.
