

## Plan: Step 3 Kahoot-Style Bar Chart + Step 1 Recording Animation

### Change 1: Step 3 — Kahoot-Style Vertical Bar Chart

Replace the current horizontal progress-bar mockup (lines 296-321) with a vertical bar chart similar to the `MCQDistributionChart` style used in the presenter view.

**Design:**
- 4 vertical bars (A, B, C, D) with option labels, colored by correct/incorrect (green for correct, red/orange/slate for wrong)
- Bars grow upward from bottom, with student counts displayed above each bar
- The correct answer bar is highlighted green, others are red/orange
- Below: "32 students responded" with a Users icon
- Light-themed version of the dark presenter chart (white bg, slate borders)

**Data (static mockup):**
- A: 5 students (red), B: 22 students (green/correct), C: 3 students (red), D: 2 students (red)
- Bars animate to full height when the section scrolls into view (using existing `step3Ref.isVisible`)

### Change 2: Step 1 — Start/Stop Recording Animation

Replace the current static mic + transcription mockup (lines 198-213) with an animated sequence:

**Animation flow (CSS-only, using state + transitions):**
1. Initial state: A "Start Recording" button (with Mic icon) centered in the card
2. After ~2 seconds (via `setTimeout` triggered when `step1Ref.isVisible`), the button animates to "pressed" state
3. Button transitions to "Stop Recording" (red, with `Square` icon), and the transcription bubble fades in below it with a typing-like reveal
4. The pulsing green dot appears, "LIVE" label shows

**Implementation:**
- Add `useState` for `isRecording` boolean
- When `step1Ref.isVisible` becomes true, set a 1.5s timeout to flip `isRecording` to true
- Use CSS transitions (`opacity`, `max-height`, `transform`) to animate the transcription bubble appearing
- Button changes from green "Start Recording" → red "Stop Recording" with smooth color transition

**Files to modify:** `src/pages/Index.tsx` only (no new files needed)

