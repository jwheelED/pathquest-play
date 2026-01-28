

# Fix Slide Presenter Issues: Preview Bypass and Poll Mode Grading

## Issues Identified

### Issue 1: Slide Presenter Still Shows Preview for Voice Commands

**Root Cause:** There are two separate flows for questions in Slide Presenter:

1. **Voice command "send question"** → Calls `handleManualQuestionSend` → Goes through `useLectureRecording` → Uses `bypassPreviewSetting` ✓
2. **Voice command "send slide question"** → Calls `handleSendSlideQuestion` → Extracts via OCR → **Opens `SlideQuestionPreviewDialog`** ✗

The `handleSendSlideQuestion` function (lines 150-261) always opens the preview dialog at line 253:
```typescript
setIsPreviewOpen(true);
```

This is a **separate flow** from the `useLectureRecording` hook bypass. The OCR-based slide question extraction was intentionally designed to show a preview for editing before sending.

**Solution:** Add an option to skip the preview and send immediately when triggered by voice command. For voice-triggered slide questions, bypass the preview dialog and call `handleConfirmSendQuestion` directly.

---

### Issue 2: Poll Mode Shows "Incorrect Answer" After Submission

**Root Cause:** The `send-slide-question` edge function correctly sets:
- `correctAnswer: isPollMode ? '' : ...` (empty string for polls)
- `isPoll: isPollMode`

But the student UI in `AssignedContent.tsx` (lines 1732-1788) always compares answers against `q.correctAnswer` without checking if it's a poll:

```typescript
const correctAnswer = q.correctAnswer;  // Could be empty string for polls
const isCorrect = studentAnswer === correctAnswer;  // Always false for polls!
```

When `correctAnswer` is an empty string (`''`), no student answer will ever match it, so every answer shows as "incorrect".

**Solution:** The UI must check for poll mode (`q.isPoll` or empty `correctAnswer`) and skip the correct/incorrect feedback entirely for polls.

---

## Implementation Plan

### Part 1: Fix Voice Command Bypass for Slide Questions

**File: `src/pages/SlidePresenter.tsx`**

Modify `handleSendSlideQuestion` to accept an optional `skipPreview` parameter:

```typescript
const handleSendSlideQuestion = useCallback(async (
  questionType: SlideQuestionType,
  skipPreview: boolean = false  // NEW parameter
) => {
  // ... existing extraction logic ...
  
  if (skipPreview) {
    // Voice command triggered - send immediately
    await handleConfirmSendQuestion(transformedData, true); // isPollMode = true
    setExtractionStage('idle');
    return;
  }
  
  // Manual trigger - show preview dialog
  setPreviewQuestionType(questionType as QuestionType);
  setPreviewExtractedData(transformedData);
  setIsPreviewOpen(true);
  setExtractionStage('idle');
}, [currentSlideNumber, handleConfirmSendQuestion]);
```

Update the ref type and voice command handler:

```typescript
const handleSendSlideQuestionRef = useRef<((type: SlideQuestionType, skipPreview?: boolean) => Promise<void>) | null>(null);

// In handleVoiceCommand:
if (type === 'send_slide_question') {
  toast.success('Voice command: Send Slide Question');
  handleSendSlideQuestionRef.current?.('mcq', true);  // Skip preview for voice commands
}
```

---

### Part 2: Fix Poll Mode UI Feedback

**File: `src/components/student/AssignedContent.tsx`**

Update the MCQ feedback logic to check for poll mode:

**Around line 1734-1738:**
```typescript
const correctAnswer = q.correctAnswer;
const isPollQuestion = q.isPoll || !correctAnswer || correctAnswer === '';
const isCorrect = isPollQuestion ? null : studentAnswer === correctAnswer;
const showFeedback = isSubmitted && !isPollQuestion; // Don't show correct/incorrect for polls
```

**Around line 1749-1755 (option styling):**
```typescript
className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
  showFeedback && isThisOptionCorrect
    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
    : showFeedback && isStudentChoice && !isCorrect
    ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
    : isPollQuestion && isStudentChoice && isSubmitted
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'  // Poll - just highlight selection
    : isSelected && !isSubmitted 
    ? 'border-primary bg-primary/5' 
    : 'border-border hover:border-primary/50'
} ${isSubmitted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
```

**Around line 1773-1788 (result text):**
```typescript
{isSubmitted && (
  <div className="space-y-3">
    {isPollQuestion ? (
      <div className="p-3 rounded border-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
          ✓ Response Recorded
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
          This was a poll - no correct/incorrect answers
        </p>
      </div>
    ) : (
      // Existing correct/incorrect feedback
    )}
  </div>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SlidePresenter.tsx` | Add `skipPreview` parameter to `handleSendSlideQuestion`, update ref type and voice command handler |
| `src/components/student/AssignedContent.tsx` | Add poll mode detection and show neutral feedback instead of incorrect |

---

## Result After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Voice command "send slide question" | Opens preview dialog | Sends immediately as poll |
| Manual button in Slide Presenter | Opens preview dialog | Opens preview dialog (unchanged) |
| Student submits poll answer | Shows "✗ Incorrect" | Shows "✓ Response Recorded" |
| Student submits graded MCQ | Shows correct/incorrect | Shows correct/incorrect (unchanged) |

