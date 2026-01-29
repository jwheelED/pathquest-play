

# Fix Three Slide Presenter Bugs

## Bug Analysis

### Bug 1: Duplicate Question Sending After Voice Command
**Root Cause:** The voice command detection system has TWO separate detection mechanisms that can BOTH trigger for the same voice command:

1. **Direct detection** in `useLectureRecording.ts` (lines 899-912): Uses `detectVoiceCommandDirect()` with refs `directVoiceLastDetectedRef` and `directVoiceLastTimeRef`
2. **Hook-based detection** via `useVoiceCommandDetection` (lines 113-124): Uses separate `lastCommandTimeRef` and `lastDetectedCommandRef` refs

When the instructor says "send slide question", BOTH detection mechanisms see the transcript chunk and can fire independently, especially if the speech is broken into multiple transcript chunks that each contain the phrase (e.g., "...send slide" then "question now...").

**Solution:** Remove the redundant hook-based detection (`checkTranscriptForCommand`) from Slide Presenter flow. The direct detection in `useLectureRecording.ts` is sufficient and already has the 15s cooldown. The hook-based detection should only be used as a fallback in non-Deepgram streaming scenarios.

---

### Bug 2: Inconsistent Preview Dialog for Slide Questions
**Root Cause:** Looking at `SlidePresenter.tsx` line 71:
```typescript
handleSendSlideQuestionRef.current?.('mcq', true); // Skip preview for voice commands
```

This line passes `skipPreview: true` for voice commands, which bypasses the preview. But based on user feedback, they actually WANT the preview to show (just without grading fields).

Additionally, looking at the callback in `handleVoiceCommand`, there's no actual inconsistency in the code - it always skips preview. The user likely experienced this differently due to timing issues where the voice command wasn't properly detected (so they clicked manually instead, which shows preview).

**User's actual request:** Always show preview in Slide Presenter, but hide:
- "Correct Answer" field for MCQ (already done - polls have no correct answer)
- "Expected Answer" field for Short Answer (already done in `SlideQuestionPreviewDialog.tsx` lines 133-139)

The dialog already handles poll mode correctly. The fix is to **always show preview** (remove `skipPreview: true` for voice commands).

---

### Bug 3: View Poll Button Shows Inconsistently
**Root Cause:** Looking at `SlidePresenterOverlay.tsx` lines 231-264:
```typescript
{isMCQ && mcqDistribution && currentStats && currentStats.responseCount > 0 && (
```

The View Poll button only shows when:
1. `isMCQ` is true (question type is multiple_choice)
2. `mcqDistribution` has data
3. `currentStats` exists
4. `currentStats.responseCount > 0`

The issue is that for SHORT ANSWER polls, `isMCQ` is `false`, so the View Poll section doesn't render at all! The response indicator and button should show for ALL question types, not just MCQ.

**Solution:** Show response count and a "View Responses" indicator for ALL question types (MCQ, short answer, etc.), not just MCQ. Keep the bar chart specific to MCQ only.

---

## Implementation Plan

### Part 1: Fix Duplicate Question Sending

**File: `src/pages/SlidePresenter.tsx`**

Add a guard to prevent duplicate calls by tracking if a slide question is already being processed:

```typescript
// Add ref to prevent duplicate voice command triggers
const isProcessingSlideQuestionRef = useRef(false);

// Update handleVoiceCommand to check the guard
const handleVoiceCommand = useCallback((type: 'send_question' | 'send_slide_question') => {
  console.log(`🎤 Slide Presenter received voice command: ${type}`);
  
  // Prevent duplicate slide question triggers
  if (type === 'send_slide_question' && isProcessingSlideQuestionRef.current) {
    console.log('⚠️ Skipping duplicate slide question trigger');
    return;
  }
  
  playNotificationSound().catch(() => {});
  
  if (type === 'send_slide_question') {
    isProcessingSlideQuestionRef.current = true;
    toast.success('Voice command: Send Slide Question');
    handleSendSlideQuestionRef.current?.('mcq', false); // Show preview, user will confirm
  } else if (type === 'send_question') {
    // ... existing code
  }
}, []);
```

Also reset the guard after question is sent in `handleConfirmSendQuestion`:
```typescript
} finally {
  setIsSendingFromPreview(false);
  isProcessingSlideQuestionRef.current = false; // Reset guard
}
```

And in `handleSendSlideQuestion` when error occurs:
```typescript
} catch (err) {
  console.error('Error in handleSendSlideQuestion:', err);
  toast.error('An error occurred while processing the slide');
  setExtractionStage('idle');
  isProcessingSlideQuestionRef.current = false; // Reset guard on error
}
```

---

### Part 2: Always Show Preview for Slide Questions

**File: `src/pages/SlidePresenter.tsx`**

Change voice command to show preview instead of skipping:

```typescript
if (type === 'send_slide_question') {
  isProcessingSlideQuestionRef.current = true;
  toast.success('Voice command: Send Slide Question');
  handleSendSlideQuestionRef.current?.('mcq', false); // Show preview (was true)
}
```

The `SlideQuestionPreviewDialog` already correctly:
- Hides "Correct Answer" selector (line 68: `isPollMode = true`)
- Clears correct_answer for MCQ polls (line 129: `correct_answer: isPollMode ? '' : mcqCorrectAnswer`)
- Clears expected_answer for short answer polls (line 135: `expected_answer: isPollMode ? '' : saExpectedAnswer`)
- Doesn't show the Expected Answer input field for short answers in poll mode

---

### Part 3: Fix View Poll Button Consistency

**File: `src/components/instructor/slides/SlidePresenterOverlay.tsx`**

Move the response count + View Poll button OUTSIDE the MCQ-only conditional, making it show for ALL question types:

**Current structure:**
```typescript
{/* Only shows for MCQ */}
{isMCQ && mcqDistribution && currentStats && currentStats.responseCount > 0 && (
  <div className="bg-slate-800/50 rounded-lg p-3">
    {/* Response count + View Poll button */}
    {/* MCQ chart */}
  </div>
)}
```

**New structure:**
```typescript
{/* Show for ANY question type with responses */}
{currentStats && currentStats.responseCount > 0 && (
  <div className="bg-slate-800/50 rounded-lg p-3">
    {/* Always visible: Response count */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs text-slate-300">
          <span className="font-bold">{currentStats.responseCount}</span>
          <span className="text-slate-500">/{studentCount} responses</span>
        </span>
      </div>
      {/* View Poll button only for MCQ */}
      {isMCQ && mcqDistribution && (
        <button
          onClick={() => setShowPollResults(!showPollResults)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium 
                     bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          <BarChart3 className="w-3 h-3" />
          {showPollResults ? 'Hide' : 'View Poll'}
        </button>
      )}
    </div>
    
    {/* MCQ chart - only for MCQ with showPollResults */}
    {isMCQ && mcqDistribution && showPollResults && (
      <div className="mt-3">
        <MCQDistributionChart ... />
      </div>
    )}
  </div>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SlidePresenter.tsx` | Add processing guard ref, reset guard on completion/error, change skipPreview to false |
| `src/components/instructor/slides/SlidePresenterOverlay.tsx` | Move response count outside MCQ conditional, keep View Poll button for MCQ only |

---

## Result After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Voice "send slide question" | Sends 2x (duplicate) | Sends 1x with preview |
| Slide question voice command | Sometimes preview, sometimes not | Always shows preview dialog |
| Short answer poll | No response indicator | Shows "X/Y responses" |
| MCQ poll | Sometimes View Poll button | Always shows View Poll button |
| Preview dialog for polls | Correct/Expected fields hidden | Still hidden (no change needed) |

