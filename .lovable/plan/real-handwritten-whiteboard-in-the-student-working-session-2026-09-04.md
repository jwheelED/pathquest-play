# Real handwritten whiteboard in the student working session

Replace the typed, timestamped step list in the student session at `/wb/student/problem/...` with a whiteboard that looks handwritten: each step the tutor writes appears in a marker-style handwriting, inking in left-to-right with a pen tip that moves along the line, as if someone is writing it live.

Nothing about the tutor itself changes — the same existing tutor call keeps producing the steps and replies. This is purely how the board looks and animates.

## What changes

- The board becomes a real writing surface: off-white paper texture, faint ruled lines, generous margins, and steps laid out down the page in handwriting instead of a table of rows.
- Handwriting typeface for board content (a marker-style face loaded alongside the existing fonts), sized larger so math like `dV/dt = 4πr² · (dr/dt)` reads like a real board.
- Ink-in animation: each new line reveals stroke-by-stroke from left to right at a natural writing pace (slightly variable, with brief pauses at spaces), with a small pen-tip mark at the write position. Lines already written stay fully inked when the page re-renders.
- Corrections get a hand-drawn strike-through that draws itself across the line, and self-corrections/answers keep their existing colour meaning (green for a correct answer or a self-correction, amber for a flagged line) as ink colour rather than a label column.
- Timestamps and the right-hand provenance label column come off the board itself. Instead, a small pencil note in the margin appears for flagged lines (the annotation the tutor already returns).
- Below the board, a collapsible "Steps" list keeps the current timestamped, labelled view for anyone who wants the precise record. Collapsed by default.
- The transcript panel on the right is unchanged and still logs every turn.
- Student cannot draw — the board is the tutor's writing surface only. Typing and the mic stay exactly as they are.

## Technical notes

- New component `src/wb/components/WbHandwrittenBoard.tsx` renders the paper surface and maps `WbBoardStep[]` to handwritten lines; `AnimatedBoardStepRow` in `WbLiveSession.tsx` is retired from the board and its logic (already-revealed tracking via `revealedIds`) moves into the new component so re-renders don't re-animate old lines.
- Ink-in effect: per-line reveal driven by a `requestAnimationFrame` loop over character count with a jittered per-character duration, masked with a CSS `clip-path` inset wipe so partial glyphs are cut mid-stroke rather than popping in whole. Pen tip is an absolutely positioned dot tracked to the wipe edge.
- Handwriting font: add Google Fonts `Caveat` (and keep the existing mono as fallback) via the same font-loading path the app already uses; expose it as a token in `src/components/edvana/tokens.ts` next to `FONT_MONO`.
- Strike-through for `struck_through` steps: an inline SVG path with a slight hand-drawn wobble, animated with `stroke-dashoffset` after the line finishes inking.
- Respect `prefers-reduced-motion` (already handled in `edvana.css`): lines appear fully inked with no wipe or pen tip.
- New `WbStepsList` collapsible section reuses the current row markup (timestamp, mono expression, provenance label) so no information is lost.
- No new AI, no new edge function, no Lovable AI Gateway usage — `wb-tutor-turn`, `wb-transcribe`, and `wb-tutor-tts` are untouched.
