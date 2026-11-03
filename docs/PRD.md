# Product Brief + PRD: Contextual Feedback for Career Portfolios

> **Note:** Part IV and Part V of this document are superseded by `SPEC.md` and `DECISIONS.md`. Keep this file for product context.

**Working name:** TBD  
**Document status:** Build-ready MVP brief; hypotheses and technical risks are explicitly marked  
**Primary user:** An experienced professional who wants to give useful feedback on someone's portfolio or resume with minimal effort  
**Initial recipient:** A student or early-career job seeker  
**Core principle:** Make giving great feedback so effortless that more of it happens.

---

# Part I — Brief

## 1. Product in one sentence

A lightweight review layer that lets professionals browse someone's existing portfolio website or resume, tap a relevant section, and leave contextual voice or text feedback in minutes—without installing an extension, creating an account, or rebuilding the artifact in another tool.

## 2. The problem

Experienced professionals regularly receive requests from students and early-career candidates to review portfolios and resumes. Many genuinely want to help, and some give detailed feedback by annotating PDFs, taking screenshots, circling content on an iPad, or writing long messages.

That workflow is cumbersome. It takes time to navigate the artifact, capture the relevant section, write or dictate feedback, organize comments, and send everything back. The friction limits how many people a willing professional can help and how much detail they provide.

The job seeker has a related problem: they need actionable feedback from people with experience, but the process of getting that feedback is awkward and inconsistent. They should not have to rebuild their portfolio in a review canvas or pay just to receive feedback someone has already given them.

## 3. Product thesis

**Make it effortless for people to give useful feedback on someone's existing work—and help that person turn multiple perspectives into meaningful career progress.**

The product is not primarily an AI career coach or a generic annotation canvas. Human judgment is the value. AI removes the administrative friction around capturing, organizing, and acting on that judgment.

## 4. Initial use case

A product manager receives an email from a student asking for portfolio feedback. The PM opens the link on a phone or tablet, browses the student's actual live website, taps a project or section, and records a short thought. The comment is transcribed and anchored to the relevant location. The PM repeats this a few times and finishes.

The student receives a shareable review page showing their original work alongside contextual comments, voice transcripts, and optional audio playback. They can use the feedback to revise their work and request another review later.

The first use case is deliberately narrow: **portfolio websites and resume PDFs for students and early-career candidates.**

## 5. Product principles

1. **Review the work where it already lives.** Do not ask people to recreate a website on a canvas or screenshot every section.
2. **No reviewer onboarding.** Reviewers should not need an account, extension, tutorial, or lengthy form.
3. **Voice-first, not voice-only.** Speech should be the fastest path, with text comments available.
4. **Context is essential.** Each comment should stay attached to the relevant section, text, page, or visual location.
5. **Preserve the human's actual meaning.** Transcripts may be corrected; AI may organize comments but must not invent criticism or attribute AI wording to the reviewer.
6. **The recipient owns the review space.** Keep it private, controlled, and accessible after the reviewer finishes.
7. **Do not charge for a bad opinion.** The initial business model should not make a customer feel they paid for one reviewer's subjective or low-quality feedback.
8. **Build the smallest real product, not a disposable prototype.** Build an end-to-end MVP and test it with real reviewers, while treating live website rendering as an early technical feasibility gate.
9. **Fast beats comprehensive.** Make a reliable, low-friction path work well before adding many artifact types or advanced AI features.

## 6. Target users

### Primary reviewer
An experienced professional—initially product managers, engineers, designers, and other practitioners—who receives requests from students or early-career job seekers and wants to help but finds detailed feedback time-consuming.

### Primary recipient
A student, bootcamp graduate, or early-career job seeker who has an existing portfolio website or resume and wants experienced feedback.

### Later audiences
- Recruiters and hiring teams who want to provide contextual feedback to candidates.
- Universities, bootcamps, alumni groups, and workforce programs that sponsor access.
- Candidates who do not have a professional network and may need access to vetted paid reviewers.

These are future opportunities, not MVP requirements.

## 7. MVP outcome

A professional can open a link and leave several useful, contextual comments on a live portfolio or PDF in a few minutes, without instructions or account creation. The recipient can reliably view, understand, and act on those comments.

## 8. MVP scope

### In scope
- Recipient creates a review request using a public portfolio URL or a PDF upload.
- System creates a private, shareable reviewer link.
- Reviewer opens the link without creating an account.
- Reviewer can browse the artifact and add comments using voice or text.
- Voice is transcribed into editable text.
- Comments are anchored to a website element/section or a PDF text/position anchor.
- Reviewer can see, edit, and delete their own comments before submitting.
- Comments auto-save as a draft and persist across navigation.
- Reviewer submits the review.
- Recipient can view the artifact and all submitted feedback in one review page.
- Reviewer attribution: name and email collected with low friction; no permanent reviewer account.
- Recipient can supply context for the review, e.g. “I'm applying for associate product manager roles at fintech companies.”
- Basic status and notifications, where practical.
- Secure, unlisted review links and recipient controls to revoke access/delete a review.
- Responsive layout, prioritizing mobile reviewer experience and tablet/desktop recipient review.

### Out of scope for MVP
- Reviewer accounts, profiles, social network, or public directory.
- Paid reviewer marketplace.
- Recruiter workflow or ATS integrations.
- Publicly discoverable reviews.
- AI-generated critique without a human comment.
- AI rewriting of the portfolio or resume.
- Multi-reviewer synthesis and consensus detection.
- Version comparisons and long-term progress analytics.
- Native mobile apps.
- Browser extension as the default path.
- Team collaboration, approvals, project management, or general-purpose annotation.
- Subscription billing before the core usage pattern is validated.

---

# Part II — Product Requirements Document

## 9. Primary user journeys

### Journey A: Create a website review request
1. Recipient opens the product.
2. Enters a public portfolio URL.
3. Adds an optional name/title and context prompt.
4. Product validates the URL and tests whether it can be displayed in the review experience.
5. Product creates a private review space and unique reviewer link.
6. Recipient copies the link and sends it to a professional.
7. Recipient can revisit the review space to see whether feedback has been started or submitted.

### Journey B: Create a PDF review request
1. Recipient uploads a PDF resume or portfolio.
2. Product stores the original file securely and renders it in the review workspace.
3. Recipient adds optional context and creates a share link.
4. Recipient sends the link to a professional.

### Journey C: Reviewer leaves feedback
1. Reviewer opens the link on a phone, tablet, or desktop.
2. Reviewer sees the recipient's context and the artifact immediately.
3. Reviewer enters their name and email with minimal friction. Prefer a lightweight identity step that does not require account creation; consider allowing the reviewer to begin first and ask for identity at submission.
4. Reviewer browses the website or PDF.
5. Reviewer taps/clicks a section or highlights text.
6. A compact comment control appears with “Record” and “Type” options.
7. Reviewer records a short audio note. The UI clearly indicates recording state and provides stop/cancel controls.
8. Audio is transcribed. Reviewer can edit the transcript before saving.
9. Comment is anchored to the current selection/section/location.
10. Reviewer can continue browsing and leave additional comments.
11. Comments auto-save as drafts.
12. Reviewer submits the review. A clear confirmation appears; the recipient is notified if notifications are configured.

### Journey D: Recipient reviews feedback
1. Recipient opens their private review space.
2. They see the original artifact with contextual comments.
3. They can select a comment to navigate to its anchor.
4. They can read the transcript and optionally play the original audio if retained.
5. They can mark comments as addressed or create a basic action checklist (optional if it materially expands scope, otherwise defer).
6. They can copy/share a view link or revoke the review link.
7. They can delete the review and associated data.

## 10. Functional requirements

### 10.1 Recipient setup
- Accept a valid public `https://` URL.
- Reject unsafe schemes such as `file:`, `javascript:`, and local/private network destinations.
- Accept PDF uploads only for the MVP; enforce file-size and page-count limits with clear errors.
- Store the original artifact separately from comments; never modify the source website or uploaded PDF.
- Allow an optional recipient display name and review context.
- Generate cryptographically random, unguessable review tokens. Do not use sequential IDs as public access credentials.
- Provide a copy-link action and a simple “send this link” share affordance.
- The recipient should not need to create a complex project or canvas.

### 10.2 Website viewing and annotation
- The desired experience is a near-live view of the existing public website inside the review workspace.
- Reviewers should be able to scroll and navigate the website as they normally would.
- Reviewer interactions must not alter the source website or submit forms on the recipient's behalf.
- A reviewer can tap/click an element or section to create a comment anchor.
- Each website comment should store, when available:
  - original page URL/path,
  - selected element's visible text,
  - a stable-ish element descriptor,
  - viewport and scroll position,
  - normalized coordinates or screenshot reference as a fallback,
  - timestamp.
- Do not rely on a CSS selector alone; selectors can break after a site changes.
- A comment should remain viewable if the page later changes. Preserve enough metadata and/or a captured visual reference to show where the comment was made.
- Provide a clear fallback when the live site cannot be rendered or reliably annotated.

**Critical technical constraint:** ordinary cross-origin iframes cannot be freely inspected or have click handlers injected by the host app. Some websites also block iframe embedding with CSP or `X-Frame-Options`. A proxy that rewrites arbitrary websites is complex and may break scripts, navigation, authentication, and security assumptions. Do not pretend universal live-site support is solved by putting an iframe on the page.

**Implementation gate:** test the rendering and annotation approach against real, public sites from Framer, Webflow, and custom React before building the rest around it. Choose an approach that works without a reviewer extension. If a robust proxy cannot be implemented safely within the MVP's scope, launch PDF review first and keep website review behind a clearly labelled supported-site/fallback path rather than shipping a fake “live” experience.

### 10.3 PDF viewing and annotation
- Render PDFs in-browser.
- Support page navigation, zoom, and scrolling.
- Support text selection/highlighting when PDF text is selectable.
- Support pin-based comments at page coordinates as a fallback.
- Each comment stores page number, selected text if available, and coordinates relative to the page.
- Preserve the original PDF unchanged.
- If a PDF is scanned or text selection is unavailable, pin comments still work; OCR can be deferred.
- A downloadable annotated PDF is optional for the MVP. The hosted review view is the priority.

### 10.4 Voice comments
- Voice capture must be available from the main review UI, without navigating to a separate recording page.
- Recording starts only after an explicit reviewer action and has visible status, elapsed time, stop, and cancel controls.
- Transcribe speech to text. Use an API/service that can be swapped later.
- Let the reviewer edit the transcript before saving.
- Preserve original audio only if needed and clearly disclosed. If audio is stored, provide deletion controls and define retention.
- Handle permission denial, unsupported browser, quiet audio, failed transcription, and network errors with recovery paths.
- Typing a comment must remain available if voice capture fails.
- A reviewer should be able to save a comment and immediately continue browsing.

### 10.5 Comments and review submission
- Comments can be created, edited, deleted, and saved as drafts.
- Each comment includes artifact anchor, transcript/text, optional audio reference, creation time, and status.
- The review has states: `created`, `in_progress`, `submitted`, and `revoked` (plus `deleted` where appropriate).
- Reviewers can submit once they are satisfied; do not force a minimum number of comments.
- The recipient can see when the review is in progress only if this can be implemented without tracking people intrusively. Avoid overbuilding “read receipts.”
- Once submitted, the review is read-only for the reviewer by default; allow a recipient to request an update later rather than silently changing submitted feedback.
- Do not charge per comment or make the reviewer choose a package.

### 10.6 Identity and access
- Recipient owns the review space. Use recipient authentication or a secure ownership link for MVP; do not leave ownership dependent on a public artifact URL alone.
- Reviewer does not need a persistent account.
- Capture reviewer name and email before submission, or at the beginning if it does not create too much friction.
- Clearly label feedback as submitted by the name provided by the reviewer. Do not claim professional identity is verified unless a verification process exists.
- Reviewer links must be unlisted, unguessable, and revocable.
- Protect against token enumeration, unauthorized uploads, and access to another user's reviews.
- Avoid putting private resume contents or reviewer emails into analytics events or URLs.
- Never index review pages in search engines; set appropriate noindex metadata and use restrictive cache controls for private content.

### 10.7 AI assistance
MVP AI should focus on capture and organization, not independent judgment:
- Speech-to-text transcription.
- Optional light formatting of transcript for readability, only if original transcript remains accessible and changes are visibly labelled.
- Do not generate unsolicited critique, scores, or recommendations.
- Do not rewrite the reviewer's meaning.
- Do not state that the reviewer said something the reviewer did not say.
- Advanced summaries, action plans, multi-reviewer synthesis, and consensus detection are post-MVP.

### 10.8 Notifications
- MVP can start with a copyable link and recipient-side status.
- Email notification to the recipient on submission is useful but not a blocker if it complicates initial build.
- If email is implemented, use a provider with a simple integration and keep notification content minimal to avoid exposing sensitive resume content.

## 11. UX and design requirements

### Reviewer experience
- Mobile-first, with iPhone Safari as a key test environment.
- The artifact occupies most of the screen.
- Keep the comment control compact and context-aware.
- Primary actions: select, record/type, save, continue.
- Make recording state unmistakable.
- Avoid prompts, forms, dashboards, or onboarding during the review.
- Do not require the reviewer to create a profile.
- Preserve draft comments if the reviewer navigates between pages or temporarily loses connectivity where feasible.

### Recipient experience
- Clean, calm, professional interface.
- Clear distinction between the original artifact, human comments, transcripts, and any AI-generated organization.
- Easy navigation from a comment to its location.
- Visible reviewer name and submission time.
- Clear controls for sharing, revoking access, and deleting the review.
- Feedback should feel like an overlay on the recipient's existing work, not a new artifact that must be maintained separately.

### Accessibility
- Keyboard navigation for desktop.
- Accessible labels for recording controls and comment anchors.
- Sufficient contrast and focus indicators.
- Do not rely on color alone to distinguish comments.
- Provide text alternatives for audio content through transcripts.

## 12. Data model (suggested)

Adapt to the chosen stack, but preserve these conceptual entities.

### `Review`
- `id`
- `owner_id` or secure ownership token reference
- `artifact_type` (`website` | `pdf`)
- `artifact_url` or `original_file_key`
- `title` (optional)
- `recipient_context` (optional)
- `reviewer_token_hash`
- `status`
- `created_at`
- `updated_at`
- `submitted_at`
- `revoked_at`
- `deleted_at`

### `ReviewerSubmission`
- `id`
- `review_id`
- `reviewer_name`
- `reviewer_email` (private; never public in a URL)
- `status`
- `created_at`
- `submitted_at`

### `Comment`
- `id`
- `review_id`
- `submission_id`
- `artifact_type`
- `text`
- `transcript_original` (optional)
- `audio_file_key` (optional)
- `anchor_data` (JSON: page URL/path, selected text, element descriptor, coordinates, PDF page, etc.)
- `screenshot_file_key` (optional)
- `status`
- `created_at`
- `updated_at`

### `ReviewEvent` (optional)
- Minimal events for created, opened, comment saved, and submitted. Avoid invasive tracking and never include artifact content in analytics payloads.

## 13. Non-functional requirements

- Reliable autosave and clear save status.
- Reasonable initial page load on mobile connections.
- Secure storage and transport; use HTTPS.
- Validate uploads and URLs on the server, not just the client.
- Rate-limit link creation, transcription, and upload endpoints.
- Use short-lived signed URLs for private files where appropriate.
- Use a server-side secret store for API keys; never expose secrets in browser bundles.
- Provide user-initiated deletion and a documented retention policy.
- Keep original reviewer text and transcripts available for correction/audit.
- Error messages should explain what happened and what the user can do next.
- Build with clear separation between artifact rendering, anchoring, comment capture, transcription, and persistence so each part can be improved independently.

## 14. Privacy, safety, and trust

The product handles resumes, personal contact details, unpublished work, and voice recordings. Treat this as sensitive data even if the product is not a regulated service.

- Private by default; no public directory or search indexing.
- Unpredictable links and revocation.
- Collect the minimum personal data needed.
- Make audio retention explicit; consider deleting audio after successful transcription unless playback is a deliberate product requirement.
- Tell reviewers when audio is recorded and what happens to it.
- Do not use submitted content or audio to train models unless there is explicit, separate consent.
- Avoid storing credentials for third-party websites; MVP should support public, unauthenticated portfolio pages only.
- Protect server-side URL fetching against SSRF: block localhost, private IP ranges, link-local addresses, internal hostnames, and redirects to blocked destinations. Limit response size and timeouts.
- A site proxy can create serious security and legal risks. Do not implement a generic open proxy without strict URL validation, domain/IP restrictions, response limits, safe header handling, and careful testing.
- Add a clear takedown/contact route before broad public use.

## 15. Success metrics

### North-star metric
**Completed, actionable reviews per active recipient.**

At MVP stage, prioritize behavior over revenue.

### Reviewer metrics
- Time from opening link to first saved comment.
- Time to submit a review.
- Percentage of reviewers who submit after starting.
- Number of useful comments per review.
- Percentage of reviews completed without support or instructions.
- Voice capture success rate and transcription correction rate.
- Repeat reviewer participation.

### Recipient metrics
- Percentage of recipients who open completed feedback.
- Self-reported usefulness of feedback.
- Percentage who make at least one change based on feedback (self-reported initially).
- Percentage who return with a revised version or request another review.

### Technical metrics
- Website render/annotation success by platform.
- PDF render success.
- Anchor navigation success.
- Transcription success and latency.
- Autosave failures and lost-comment incidents.

### Business metrics (later)
- Conversion to paid improvement pass.
- Repeat purchase.
- Sponsored credits used.
- Revenue per recipient.
- Cost per review, including transcription/storage.
- Refunds or complaints related to review quality.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Live websites cannot reliably be embedded or instrumented | Run an early technical gate against real public sites; do not assume iframe support; use a supported-site/fallback strategy |
| Mobile voice capture interrupts browsing | Test on actual iPhones and iPads; keep controls compact; persist drafts |
| Anchor breaks when website changes | Store multiple anchor signals and a screenshot/coordinate fallback |
| Reviewers leave vague feedback | Do not add forced prompts initially; let the recipient supply context; later test optional prompts or quality signals |
| Reviewers do not finish | No account, no extension, no minimum comment count, autosave, simple completion |
| Customers pay for poor feedback | Keep receiving/viewing free; monetize improvement workflow or access, not a single opinion |
| Reviewer identity is misrepresented | Display self-reported identity accurately; don't claim verification |
| Sensitive artifacts leak | Private links, access controls, revocation, noindex, secure storage, deletion, minimal analytics |
| AI distorts human feedback | Preserve original transcript and label any AI transformation |
| Product becomes generic annotation software | Stay focused on career artifacts, expert feedback, voice-first capture, and improvement over time |

---

# Part III — Business Model Hypotheses

## 17. Guiding principle

The job seeker is the likely initial payer because they have the urgent need and benefit directly. The professional is a contributor whose participation should be free and frictionless. However, the product must test whether customers pay for the tool, for an improvement process, or for access to expertise.

Do not charge recipients simply to view feedback already provided.

## 18. Models to test

### Model A — Free review layer + paid improvement pass (leading hypothesis)
- Free: create a basic review space, invite professionals, receive and view feedback.
- Paid: a 30–60 day improvement pass with multiple perspectives, revision rounds, version tracking, and feedback organization.
- Illustrative test price: $19–29 per pass; not validated.
- Risk: a pass may be too much for a one-off request.

### Model B — Review bundles
- Free core; optional paid package for a defined number of rounds or advanced features.
- Illustrative test: $15 for one improvement cycle or $29 for three; not validated.
- Risk: customers may feel they paid for low-quality opinions.

### Model C — Sponsored access
- Universities, bootcamps, alumni groups, workforce programs, or employers buy access/credits for students.
- Keeps the core experience accessible.
- Requires institutional distribution and sales; likely a later or parallel experiment.

### Model D — Paid expert review marketplace
- Job seekers pay vetted professionals for a review.
- Higher-value offer, but introduces reviewer recruitment, quality assurance, scheduling, payment, refunds, and marketplace operations.
- Keep out of MVP.

## 19. Pricing decision framework

Evaluate each model against:
- Does the customer understand what they are paying for?
- Does it align payment with a real outcome?
- Does it avoid charging for a bad or undelivered opinion?
- Does it preserve reviewer participation?
- Is the need frequent enough for a subscription?
- Can a student afford it?
- Can institutions sponsor it?
- Is the business operationally simple enough for an early product?

Do not launch a recurring subscription until repeat use is demonstrated. Career feedback may be episodic, so a time-limited pass or sponsored access may fit better than monthly billing.

---

# Part IV — Build Plan for Claude Code

## 20. Build philosophy

Build an end-to-end MVP that can be hosted and used by real people. Do not spend weeks creating a disposable clickable prototype. However, do not build the entire product before testing the largest technical risk.

**The first milestone is a technical gate inside the actual application:** prove whether the chosen no-extension approach can load and annotate a representative set of public live portfolios. If it fails, make an explicit scope decision before building a large amount of dependent code.

## 21. Suggested implementation sequence

### Milestone 0 — Repository and architecture
- Inspect the existing repository before changing it.
- Summarize the current stack and conventions.
- Choose the smallest stack compatible with the repo; do not replace existing technology without a strong reason.
- Add environment variable documentation and local setup instructions.
- Define the data model and access-control approach before building UI.

### Milestone 1 — Website feasibility gate
- Create a minimal page that accepts a public URL and attempts the selected rendering approach.
- Test several real public Framer, Webflow, and custom React portfolio sites.
- Test on desktop and mobile Safari.
- Determine whether the reviewer can scroll, navigate, and attach comments to a selected location.
- Record which domains/platforms work and why failures occur.
- Do not claim general support if only a few sites work.
- If using a proxy, implement URL validation and SSRF protection before enabling public use.
- If a robust proxy is too large or risky for the MVP, proceed with PDF as the fully supported path and a clearly scoped website fallback while researching a better architecture.

### Milestone 2 — PDF review end to end
- Create review.
- Upload PDF securely.
- Generate unguessable reviewer link.
- Render PDF.
- Add page-position comments and text anchors where possible.
- Persist drafts and submissions.
- Show recipient feedback view.
- Add deletion/revocation.

### Milestone 3 — Voice-first comments
- Add browser audio recording with explicit consent.
- Integrate transcription through a server-side API.
- Support transcript editing before save.
- Handle permission errors, failures, retries, and text-only fallback.
- Test actual mobile Safari behavior.

### Milestone 4 — Website comments
- Implement the chosen live website rendering approach only after the feasibility gate.
- Add element/section anchors, page URL, scroll position, and fallback visual references.
- Ensure comments persist across navigation.
- Add clear fallback for unsupported sites.

### Milestone 5 — Identity, ownership, and notifications
- Implement recipient ownership securely.
- Capture reviewer name/email without creating an account.
- Add email notification if it does not block core use.
- Add review status, revocation, and deletion.

### Milestone 6 — Pilot readiness
- Test with the product owner acting as reviewer.
- Invite a small number of real students/candidates.
- Fix issues that cause lost comments, broken anchors, confusing access, or friction.
- Track core usage metrics with privacy-safe analytics.
- Do not add paid billing until the core review flow works reliably.

## 22. Engineering guardrails for the coding agent

- Start by inspecting the repository and proposing a brief implementation plan.
- Make incremental, testable changes rather than generating the whole application in one pass.
- Keep components small and responsibilities separated.
- Keep API keys server-side.
- Validate URLs and uploaded files on the server.
- Add automated tests for access controls, token validation, comment persistence, and upload constraints.
- Use realistic empty, loading, error, and success states.
- Do not mock a live website as if it were truly live.
- Do not silently fall back from live site to a screenshot without informing the reviewer.
- Do not implement payments, a marketplace, or advanced AI summaries in the first build.
- Document known website-platform limitations.
- Add a README with setup, environment variables, migrations, tests, deployment steps, and security notes.
- If an architectural decision is blocked by a technical limitation, stop and explain options rather than burying the limitation in a workaround.

## 23. Definition of done for MVP

A first usable version is ready when:
1. A recipient can create a review space from a PDF and, for supported sites, a public portfolio URL.
2. A reviewer can open the link without an account.
3. The reviewer can add at least one voice-transcribed or typed comment.
4. The comment remains attached to the intended location.
5. Drafts persist across navigation and refresh.
6. The reviewer can submit the review.
7. The recipient can see the correct feedback and reviewer attribution.
8. The owner can revoke access and delete the review.
9. No other user can access a review by guessing an ID.
10. The product is usable on mobile Safari.
11. Failures are recoverable and never silently discard comments.
12. Known live-site support limits are documented and visible to users.

---

# Part V — Copy/Paste Starter Prompt for Claude Code

You are building an MVP for a product that makes it effortless for experienced professionals to give contextual feedback on students' and early-career candidates' existing portfolio websites and resume PDFs.

The central workflow is: **Open → Explore → Select → Speak or type → Save → Continue.**

The reviewer must not need an account, browser extension, tutorial, or separate canvas. The recipient should be able to paste a public portfolio URL or upload a PDF, create a private review link, and invite a professional. The professional can browse the artifact, tap or select a relevant section, leave a voice-transcribed or typed comment, and submit. Comments must be anchored to the relevant website section or PDF page/location. The recipient sees the original artifact and contextual feedback in a persistent private review space.

Product principles:
- Preserve the original website/document; add a review layer.
- Reviewer is free and has no account.
- Recipient owns the review space and can revoke access/delete it.
- Voice transcription is an aid to human feedback, not AI-generated critique.
- Preserve reviewer meaning and allow transcript correction.
- Never charge per comment in the MVP.
- No marketplace, subscription billing, public profiles, or advanced AI coaching in the MVP.
- Prioritize mobile reviewer UX, especially iPhone Safari.
- Treat resumes, unpublished work, personal details, and audio as sensitive.
- Do not claim universal live website support unless it has been tested.

Before coding:
1. Inspect the repository, identify the stack and existing conventions, and summarize them.
2. Propose a concise implementation plan and identify the main technical risks.
3. Prioritize an early technical feasibility gate for displaying and annotating real public websites without an extension. Ordinary iframes cannot inspect cross-origin content and some sites block embedding. Do not fake a live experience. Test representative Framer, Webflow, and custom React portfolios. If a safe, reliable live rendering approach is not feasible within the current stack, explain the tradeoffs and proceed with a robust PDF review flow plus a clearly scoped website fallback.
4. If using a server-side proxy, implement strict SSRF protections, block private/local network targets and unsafe redirects, enforce timeouts and response limits, and document remaining risks.
5. Build incrementally. Keep secrets server-side. Validate uploads and URLs on the server. Implement secure, unguessable review tokens and access controls. Add tests for authorization, persistence, and input validation.
6. Provide a complete README with local setup, environment variables, database migrations, testing, deployment, and known limitations.

First deliverable: repository assessment, proposed architecture, data model, technical feasibility plan, and first implementation milestone. Do not start by generating a large amount of code before resolving the live website rendering risk.
