

# Trigger-Based Question Capture for Live Copilot

## Problem
Currently, passive question detection works on individual transcript chunks — it checks each chunk for a `?` and extracts the question from that single chunk. This means multi-chunk questions get truncated (only the tail end is captured), and the detected text depends on however Deepgram happened to split the utterance.

## Solution: Question Trigger + Buffer Capture Mode

When the transcript stream detects a question trigger phrase (e.g., "what is", "why does", "how many"), it enters a **capture mode** that buffers all subsequent chunks until a speech boundary (pause or sentence-ending punctuation) is reached. The full buffered text is then minimally post-processed and emitted as the detected question.

## Technical Design

### New hook: `useQuestionTriggerCapture.ts`

**Trigger detection:**
- Regex set matching interrogative starts: `what is/are/was/were/do/does/did/would/could/should/about`, `why is/are/do/does/did/would`, `how many/much/do/does/did/is/are/would/could/can`, `when is/are/do/does/did/would`, `where is/are/do/does/did`, `who is/are/was/were/does/did/would/can`, `which one/of/is`
- Only triggers on **final** (non-interim) Deepgram results
- 15-second cooldown between triggers (same as current passive detection)

**Capture mode:**
- Once triggered, a `captureBuffer` ref accumulates every subsequent transcript chunk
- Capture ends when any of these conditions are met:
  - A sentence-ending punctuation (`.`, `!`, `?`) is detected in a chunk
  - A silence gap > 1.5 seconds between chunks (tracked via timestamps)
  - Buffer exceeds 200 words (safety cap)
  - 15 seconds elapsed since trigger (timeout safety)

**Minimal post-processing (no paraphrasing):**
1. Merge all buffered chunks into a single string
2. Remove duplicate words at chunk boundaries (e.g., "the mitochondria the mitochondria" → "the mitochondria")
3. Strip leading filler: "so", "um", "uh", "like", "well", "okay so"
4. Restore sentence-ending `?` if missing
5. Trim whitespace

**Output:**
- Emits a `PassiveQuestionCandidate` (same interface as current detection) so it plugs directly into the existing Question On Deck card and auto-preview flow
- Priority over chunk-based detection: if trigger capture is active, suppress regular `checkUtterance` to avoid duplicates

### Integration points

**`useLectureRecording.ts` and `LectureTranscription.tsx`:**
- Before calling `checkPassiveQuestion(cleanText)`, first call `feedChunk(cleanText, timestamp)` on the trigger capture hook
- If trigger capture is actively buffering, skip `checkPassiveQuestion`
- When trigger capture emits a completed question, route it through the same candidate setter

**`LiveCopilotHero.tsx`:**
- No changes needed — it already renders whatever `questionCandidate` is passed in

### Files to create/modify

| File | Action |
|------|--------|
| `src/hooks/useQuestionTriggerCapture.ts` | **Create** — new hook with trigger detection, buffer capture, and post-processing |
| `src/hooks/useLectureRecording.ts` | **Modify** — integrate trigger capture before passive detection |
| `src/components/instructor/LectureTranscription.tsx` | **Modify** — same integration for the transcription component |

### Edge cases handled
- Rhetorical questions: same blocklist filtering applied after capture completes
- Greeting patterns: same regex filtering
- Overlapping triggers: new trigger resets the buffer (latest wins)
- No question mark in speech: appended automatically since we know it started with an interrogative

