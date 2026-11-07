# Talk-through follows where you were looking; whole words from whisper

Jas's first real website talk-through (61 s, scrolling the whole page, one tap at the end) came back as a single "On screen" comment pinned to the top of the page, and "Vietnam" showed as "v ietnam".

## What changed
- **Split by view** (`viewSplit` in `apps/web/lib/server/resolve.ts`). Untapped talk that the AI didn't pin to an element is cut where the view changed: another page, another PDF page, or a scroll of at least half a screen. The cut goes at the best natural break within about 3 s before or 4 s after the change: end of a sentence, then after an "um", then the longest pause. Each piece is at least 8 words, and each is pinned to what was on screen at its midpoint.
  - Taps and AI element anchors are untouched, the words are untouched, and no extra AI calls are made.
  - On Jas's recording this gives four comments: top of the page, the project grid, further down, and the tap.
- **Whole words** (`fromWhisper`). whisper.cpp sends word pieces without a leading space (" V" + "ietnam", " you" + "'re"). These are now joined back into one word, within the same segment only.
- **SPEC note:** SPEC §5.2's slice order gains a step between the AI pass and the viewport fallback. This was requested by Jas on 2026-11-06 ("anchor the feedback to the area on screen at the time… that's where my eyes are").

## Tests
- `apps/web/test/resolve.test.ts`:
  - splitting after "um" with the right scroll anchors;
  - no split for small scrolls;
  - a page change splits;
  - minimum piece length;
  - taps are left alone;
  - the words are unchanged.
- `apps/web/test/whisper.test.ts`: word pieces join, and a new segment always starts a new word.
- Server-only change, so no UI screenshots. No new dependencies.

## Known limitations
- Recordings made before this change keep their comments; only new recordings are split.
- If you talk for a long time without scrolling, it's still one comment (same area).
- The transcript has no punctuation when whisper doesn't give any, so breaks rely on pauses and "um".
