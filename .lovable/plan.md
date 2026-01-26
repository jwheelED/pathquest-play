
# Fix Voice Commands in Slide Presenter

## Problem Summary
Voice commands ("send question" and "send slide question") in the Slide Presenter are not working reliably because the voice command detection depends on `transcriptChunks` state, which is only updated every 5 transcript chunks and is replaced rather than appended to.

## Root Cause

In `useLectureRecording.ts` (lines 836-843), the Deepgram streaming callback:
```typescript
if (transcriptChunkCountRef.current % 5 === 0) {
  const recentText = intervalTranscriptRef.current.slice(-2000);
  setTranscriptChunks([recentText]); // REPLACED, not appended
}
```

This causes two issues:
1. Voice commands spoken between state updates are never detected
2. The `useVoiceCommandDetection` hook's index tracking breaks when the array is replaced

Meanwhile, `LectureTranscription.tsx` (used in regular Live Lecture Capture) appends each chunk immediately and has its own inline voice command detection that runs on every transcript.

## Solution

Add **direct streaming voice command detection** in `useLectureRecording.ts` that checks each incoming transcript immediately, bypassing the batched state updates.

## Technical Implementation

### File: `src/hooks/useLectureRecording.ts`

**Change 1: Add direct voice command detection helper (new function around line 56)**

```typescript
// Direct voice command detection - checks raw text without relying on state
const detectVoiceCommandDirect = (text: string, lastDetectedRef: React.MutableRefObject<string>, lastTimeRef: React.MutableRefObject<number>, cooldownMs: number = 15000): 'send_question' | 'send_slide_question' | null => {
  if (!text || text.length < 5) return null;
  
  const normalizedText = text.toLowerCase().trim();
  const now = Date.now();
  
  // Cooldown check
  if (now - lastTimeRef.current < cooldownMs) return null;
  
  // Skip if same command phrase detected recently
  if (lastDetectedRef.current && normalizedText.includes(lastDetectedRef.current)) return null;
  
  // Check for slide commands FIRST (more specific)
  const slidePatterns = [
    /send\s+(this\s+)?slide(\s+question)?(\s+now)?/i,
    /send\s+slide\s+question/i,
    /slide\s+question(\s+now)?/i,
  ];
  
  for (const pattern of slidePatterns) {
    if (pattern.test(normalizedText)) {
      lastTimeRef.current = now;
      lastDetectedRef.current = normalizedText.substring(0, 30);
      return 'send_slide_question';
    }
  }
  
  // Check for question commands
  const questionPatterns = [
    /send\s+(the\s+|a\s+|this\s+)?question(\s+now)?/i,
    /question\s+now/i,
  ];
  
  for (const pattern of questionPatterns) {
    if (pattern.test(normalizedText)) {
      lastTimeRef.current = now;
      lastDetectedRef.current = normalizedText.substring(0, 30);
      return 'send_question';
    }
  }
  
  return null;
};
```

**Change 2: Add refs for direct detection tracking (around line 130)**

```typescript
// Direct voice command detection refs (independent of state-based detection)
const directVoiceLastDetectedRef = useRef<string>('');
const directVoiceLastTimeRef = useRef<number>(0);
```

**Change 3: Update onTranscript callback to detect commands directly (around line 815-845)**

In the `startDeepgramStreaming` callback, after sanitizing the transcript, add direct voice command detection:

```typescript
onTranscript: (data: DeepgramTranscript) => {
  if (data.isFinal && data.text.trim()) {
    const cleanText = sanitizeTranscript(data.text);
    if (!cleanText) {
      console.log('🚫 Skipping hallucinated transcript');
      return;
    }
    
    console.log('📝 Deepgram final transcript:', cleanText);
    
    // DIRECT voice command detection - check immediately on each transcript
    if (onVoiceCommand) {
      const command = detectVoiceCommandDirect(
        cleanText,
        directVoiceLastDetectedRef,
        directVoiceLastTimeRef,
        15000 // 15s cooldown
      );
      
      if (command) {
        console.log(`🎤 Direct voice command detected: ${command}`);
        setVoiceCommandDetected(true);
        setTimeout(() => setVoiceCommandDetected(false), 2000);
        onVoiceCommand(command);
      }
    }
    
    // ... rest of existing code for buffer updates
  }
}
```

**Change 4: Reset direct detection refs when recording stops (around line 647)**

```typescript
// Reset state when recording stops
useEffect(() => {
  if (!isRecording) {
    setNextAutoQuestionIn(0);
    intervalTranscriptRef.current = '';
    isGeneratingAutoQuestionRef.current = false;
    resetVoiceCommandCooldown();
    
    // Reset direct voice command detection refs
    directVoiceLastDetectedRef.current = '';
    directVoiceLastTimeRef.current = 0;
    
    // Stop and cleanup timer
    if (reliableTimerRef.current) {
      reliableTimerRef.current.stop();
    }
  }
}, [isRecording, resetVoiceCommandCooldown]);
```

## Summary of Changes

| File | Changes |
|------|---------|
| `src/hooks/useLectureRecording.ts` | Add direct voice command detection in Deepgram streaming callback, bypassing batched state updates |

## How It Works After Fix

1. **Every Deepgram transcript** is checked immediately for voice commands
2. **"send slide question"** or **"send slide"** triggers `handleSendSlideQuestionRef.current('mcq')` → Opens preview dialog for slide OCR question
3. **"send question"** or **"send question now"** triggers `handleManualQuestionSendRef.current()` → Extracts question from transcript and opens preview dialog
4. **15-second cooldown** prevents double-triggers from the same command phrase remaining in buffer

## Expected Behavior After Fix

- Instructor says "send slide question" → Slide OCR extraction starts immediately
- Instructor says "send question now" → Transcript-based question extraction starts immediately  
- Both commands work identically to how they work in regular Live Lecture Capture
- Visual feedback (emerald glow, mic icon) shows when command is detected
