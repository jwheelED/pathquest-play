
# Fix Voice Command Question Extraction Timing Bug

## Problem Identified

When a user says an impromptu question followed by "send question now" in the Slide Presenter, the spoken question is NOT included in the transcript buffer when the extraction happens.

### Root Cause

In `useLectureRecording.ts`, the Deepgram transcript handler processes voice commands in the wrong order:

```typescript
// Lines 886-905 - CURRENT ORDER (BUGGY)
if (onVoiceCommand) {
  const command = detectVoiceCommandDirect(cleanText, ...);
  if (command) {
    onVoiceCommand(command);  // ← Fires immediately!
  }
}

// Append to buffers AFTER voice command fires
transcriptBufferRef.current += ' ' + cleanText;  // ← Too late!
```

When the voice command handler calls `handleManualQuestionSend`, it reads from `transcriptBufferRef.current.slice(-1500)`, but the **current transcript chunk** (containing the question) hasn't been appended yet!

### Timeline of Bug:
1. User says: "How many bones in the human body? Send question now"
2. Deepgram transcript arrives: `"How many bones in the human body? Send question now"`
3. Voice command "send question now" detected → `onVoiceCommand()` fires
4. `handleManualQuestionSend()` reads buffer → **buffer doesn't have the question yet!**
5. Edge function gets old/insufficient content → generates fallback
6. Buffer finally gets appended → too late

---

## Solution

Reorder the transcript handler to append to buffers FIRST, then detect voice commands:

### Change in `src/hooks/useLectureRecording.ts`

**Current order (lines 886-905):**
```typescript
// 1. Detect voice command FIRST (bug)
if (onVoiceCommand) { ... onVoiceCommand(command); }

// 2. Append to buffers SECOND (too late)
transcriptBufferRef.current += ' ' + cleanText;
```

**Fixed order:**
```typescript
// 1. Append to buffers FIRST
transcriptBufferRef.current += ' ' + cleanText;
intervalTranscriptRef.current += ' ' + cleanText;

// Trim if needed
if (intervalTranscriptRef.current.length > TRANSCRIPT_MAX_LENGTH) {
  intervalTranscriptRef.current = intervalTranscriptRef.current.slice(-TRANSCRIPT_MAX_LENGTH);
}

// 2. THEN detect voice command (buffer now has the question!)
if (onVoiceCommand) {
  const command = detectVoiceCommandDirect(cleanText, ...);
  if (command) {
    onVoiceCommand(command);
  }
}

// 3. Update React state last
transcriptChunkCountRef.current++;
setLastTranscript(cleanText);
```

### Optional: Add Small Delay for Buffer Propagation

As additional protection, add a 500ms delay after detecting the voice command before calling the extraction function. This ensures the buffer is fully populated.

In `src/pages/SlidePresenter.tsx`, update `handleVoiceCommand`:

```typescript
const handleVoiceCommand = useCallback((type: 'send_question' | 'send_slide_question') => {
  playNotificationSound().catch(() => {});
  
  if (type === 'send_slide_question') {
    toast.success('Voice command: Send Slide Question');
    handleSendSlideQuestionRef.current?.('mcq', true);
  } else if (type === 'send_question') {
    toast.success('Voice command: Send Question');
    // Small delay to ensure transcript buffer is fully populated
    setTimeout(() => {
      handleManualQuestionSendRef.current?.();
    }, 500);
  }
}, []);
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useLectureRecording.ts` | Reorder: append to buffers BEFORE voice command detection |
| `src/pages/SlidePresenter.tsx` | Add 500ms delay for `send_question` voice command |

---

## Result After Fix

| Scenario | Before | After |
|----------|--------|-------|
| "How many bones? Send question now" | Buffer empty → fallback question | Buffer has question → correct extraction |
| Voice command fires | Before buffer append | After buffer append |
| Delay before extraction | None | 500ms safety margin |

---

## Technical Summary

The fix ensures the transcript containing the spoken question is in the buffer before the voice command triggers extraction. The 500ms delay provides additional safety for async buffer propagation.
