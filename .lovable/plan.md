
## Problem

1. **Leftover chunks after restart.** `stopRecording` / `startRecording` reset some refs but never call `resetTriggerCapture()` or `resetPassiveDetection()`. The trigger-capture hook keeps a rolling `bufferRef` of transcript chunks that survives across recordings, so the next session starts "contaminated" with chunks from the previous one (visible as stale transcript display + ghost question candidates). A few other refs also leak: `lastTranscript`, `transcriptChunkCountRef`, `intervalTranscriptSnapshotRef`, and the direct voice-command cooldown refs.
2. **Unreliable question capture.** Today the only path that auto-detects spoken questions is the strict interrogative-trigger pipeline in `useQuestionTriggerCapture`. If Deepgram's final transcript chunks the question in an awkward way, or the WH/aux trigger fails the "clause-start" anchor, the question is silently dropped — the instructor has no signal that it was missed.

## Fix

### A. Full reset on stop and on start (`src/hooks/useLectureRecording.ts`)

Create one helper `resetRecordingState()` and call it from both `startRecording` (before connecting) and `stopRecording` (after disconnecting Deepgram). It clears:

- `transcriptChunks` state and `lastTranscript` state
- `transcriptBufferRef`, `intervalTranscriptRef`, `intervalTranscriptSnapshotRef`
- `transcriptChunkCountRef`, `recordingCycleCountRef`, `failureCount`
- `directVoiceLastDetectedRef`, `directVoiceLastTimeRef`
- `resetTriggerCapture()` and `resetPassiveDetection()` (hook-internal buffers)
- `resetVoiceCommandCooldown()`

Also harden `stopRecording` so the `MediaRecorder` `ondataavailable` / `onstop` handlers are unbound before nulling the ref, preventing a late-arriving chunk from the previous session being processed after stop.

### B. Reliability improvements

1. **Re-enable a guarded question-mark fallback.** In the Deepgram `onTranscript` callback, after `feedTriggerChunk(...)`, if the chunk ends with `?` AND the trigger pipeline did not arm a pending capture within ~1.5s, route the chunk through `checkPassiveQuestion(cleanText, intervalTranscriptRef.current)`. The existing rhetorical/greeting blocklist in passive detection still filters out "right?", "make sense?", etc.
2. **Visible miss signal.** When a chunk contains a `?` or a WH-word but is rejected by the trigger/passive pipelines, log a single console line and (debounced to once per 30s) show a subtle non-destructive toast: "Heard a question but couldn't capture it — tap Send Question to use the last 15s." This makes the failure mode discoverable instead of silent.
3. **Lower friction on the manual fallback.** `handleManualQuestionSend` already exists; ensure the button reads `transcriptBufferRef.current` AFTER a 250ms flush so a question spoken immediately before pressing the button is included.

### C. Verification

- Start recording, say a question, press Stop, press Start: confirm `transcriptChunks` is empty and no ghost candidate appears (check console for `🎯 Trigger capture emitted question` — should not fire from old buffer).
- Speak three different question phrasings ("What happens when…", "How does X compare to Y?", "Is this the same as…?") and confirm each produces either a captured candidate or the new "couldn't capture" toast — never silent.
- Build passes.

## Technical notes

- All changes are confined to `src/hooks/useLectureRecording.ts`. `useQuestionTriggerCapture` and `usePassiveQuestionDetection` already expose the reset functions and `checkUtterance`; no edits needed there.
- No schema, edge function, or backend changes.
