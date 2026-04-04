

# Add Transcript Context Window to Question Trigger Capture

## Problem

The trigger capture hook only examines each individual chunk in isolation. When Deepgram splits a question across chunks — e.g., chunk 1: "so the wave will be", chunk 2: "increasing and what property of", chunk 3: "the wave is increasing" — the trigger word "what" may land in a chunk that doesn't start with it (it's mid-chunk), or the interrogative phrase spans a chunk boundary. The result is truncated or nonsensical detections like "the wave will be increasing?"

## Solution: Sliding Context Window

Add a small ring buffer of recent chunks (last 5 chunks, capped at ~500 chars) to `useQuestionTriggerCapture`. On each new chunk, concatenate the window and scan the **combined text** for trigger patterns — not just the latest chunk. When a trigger is found mid-window, start the capture buffer from the trigger word forward, discarding the pre-trigger context.

## Changes

### `src/hooks/useQuestionTriggerCapture.ts`

1. **Add a `recentChunks` ring buffer** to `CaptureState` — stores the last 5 raw chunks with timestamps
2. **On each `feedChunk` call (when not already capturing)**:
   - Push the new chunk into the ring buffer (evict oldest if > 5)
   - Concatenate all chunks in the window into a single string
   - Scan the concatenated string for trigger patterns
   - If a trigger is found, extract everything from the trigger word onward as the initial capture buffer content
3. **When capturing completes**, clear the ring buffer to avoid re-triggering on stale context
4. **Passive detection (`checkUtterance`)** — no changes needed; it already receives the same chunks independently

### `src/hooks/useLectureRecording.ts` and `src/components/instructor/LectureTranscription.tsx`

No changes — the integration point (`feedTriggerChunk(cleanText, Date.now())`) remains identical.

## Example

```text
Chunk 1: "so the wave will be"          → window: ["so the wave will be"]
Chunk 2: "increasing and what property" → window: ["so the wave will be", "increasing and what property"]
  → combined: "so the wave will be increasing and what property"
  → trigger match: "what property" at position 39
  → capture starts with: "what property"
Chunk 3: "of the wave is increasing"    → appended to capture buffer
  → sentence end detected → finishCapture
  → output: "What property of the wave is increasing?"
```

## Constraints

- Window capped at 5 chunks / 500 chars to avoid memory growth
- Ring buffer is reset on capture completion and on `resetCapture()`
- No changes to post-processing logic or rhetorical filtering

