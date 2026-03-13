

## Plan: Passive Question Detection from Deepgram Punctuation

### Concept

Add a new detection mode that monitors `is_final` transcript utterances for question marks (`?`) inserted by Deepgram's smart formatting. When the speaker naturally asks a substantive question, the system surfaces it as a candidate for sending to students — no "send question" phrase needed.

### How It Works

Deepgram's `smart_format` (already enabled on the Fly.io proxy) automatically adds punctuation including `?` to transcribed speech. The system will:

1. Watch every `is_final` transcript chunk for sentences ending in `?`
2. Filter out rhetorical/filler questions (blocklist)
3. Filter by minimum word count (8+ words) to skip "Right?" or "Does that make sense?"
4. Show a non-intrusive candidate toast/card to the speaker with "Send" or "Dismiss"

### Files to Create/Edit

#### 1. New Hook: `src/hooks/usePassiveQuestionDetection.ts`

Core detection logic, separated from voice command detection:

- **Input**: receives each `is_final` transcript string
- **Punctuation scan**: extracts sentences ending in `?`
- **Filters**:
  - Minimum 8 words
  - Not in rhetorical blocklist: "right?", "does that make sense?", "you know?", "okay?", "understand?", "got it?", "see what I mean?", "isn't it?", "aren't they?", "don't you think?", etc.
  - Not starting with filler words only
  - Cooldown: 30 seconds between detections (prevent rapid-fire)
  - Skip if a voice command or auto-question was just sent (check `lastQuestionSentTime`)
- **Output**: calls `onQuestionCandidate(questionText: string)` callback
- **Toggle**: `enabled` flag so instructors can turn this on/off

#### 2. New Component: `src/components/instructor/PassiveQuestionCandidate.tsx`

A small floating card (bottom-right) that appears when a candidate question is detected:

- Shows the detected question text
- "Send to Students" button (triggers the existing `handleQuestionSend` flow via `extract-voice-command-question` or directly via `format-and-send-question`)
- "Dismiss" button (hides the card, resets cooldown)
- Auto-dismisses after 15 seconds if no action
- Subtle entrance animation (slide up)

#### 3. Edit: `src/components/instructor/LectureTranscription.tsx`

- Import and wire `usePassiveQuestionDetection` hook
- Pass each final transcript chunk to the hook's `checkUtterance()` method (inside the existing `onTranscript` callback at ~line 2278)
- Add `PassiveQuestionCandidate` component to the render tree
- Wire "Send" action to existing `handleQuestionSend` with `extraction_method: "passive_detection"`
- Add a toggle in the recording controls UI: "Auto-detect questions" switch (default: ON for testing)

#### 4. Edit: `src/hooks/useLectureRecording.ts`

- Same integration for the SlidePresenter path: wire the hook into the `onTranscript` callback (~line 898)
- Expose `questionCandidate` state and `dismissCandidate` action

### No Backend Changes Needed

The existing `format-and-send-question` edge function already accepts a `question_text` + `suggested_type`. Passively detected questions skip the `extract-voice-command-question` step entirely since we already have the clean question text from Deepgram's punctuated output.

### Detection Flow

```text
Deepgram final transcript arrives
  → "What is the derivative of x squared?"
  → usePassiveQuestionDetection processes it
  → Passes filters (10 words, not rhetorical, cooldown clear)
  → Shows PassiveQuestionCandidate card
  → Speaker clicks "Send" → format-and-send-question
  → Or auto-dismisses after 15s
```

### Scope

- 2 new files (hook + component)
- 2 edited files (LectureTranscription.tsx, useLectureRecording.ts)
- No database changes, no new edge functions, no proxy changes

