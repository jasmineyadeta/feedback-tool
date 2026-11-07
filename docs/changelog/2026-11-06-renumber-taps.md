# Renumber taps after an undo

Jas: "yes renumber them". While recording on a website, undoing a tap now renumbers the remaining taps 1, 2, 3… in the order they were made, and the next tap continues from there. The PDF already numbers taps from the current list.

- Overlay-only change.
- Test: `e2e/untap.spec.ts` now taps three things, undoes the middle one, and expects `1, 2`, in both browsers.
- No UI layout change (same markers), so no new screenshots. No new dependencies.
