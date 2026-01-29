
# Fix Slide Presenter Voice Command and Preview Bugs

## Bug 1: Voice Command Stops Working After First Use

### Root Cause

In `SlidePresenter.tsx`, the guard ref `isProcessingSlideQuestionRef` is set to `true` when the voice command fires (line 79), but it's only reset in TWO places:
1. `handleConfirmSendQuestion` finally block (line 203) - when user clicks "Send"
2. `handleSendSlideQuestion` catch block (line 325) - when extraction error occurs

**Missing reset scenarios:**
- User cancels/closes the preview dialog → guard stays `true` forever
- User closes dialog by clicking outside → guard stays `true`
- Dialog closes programmatically → guard stays `true`

All subsequent voice commands are blocked because line 69 returns early:
```typescript
if (type === 'send_slide_question' && isProcessingSlideQuestionRef.current) {
  console.log('⚠️ Skipping duplicate slide question trigger - already processing');
  return; // Forever blocked!
}
```

### Solution

Reset the guard when the preview dialog closes for ANY reason:

**File: `src/pages/SlidePresenter.tsx`**

Add a useEffect to reset the guard when preview dialog closes:

```typescript
// Reset processing guard when preview dialog closes for any reason
useEffect(() => {
  if (!isPreviewOpen) {
    isProcessingSlideQuestionRef.current = false;
  }
}, [isPreviewOpen]);
```

---

## Bug 2: Question Preview Loads with Blank Options

### Root Cause

Two issues in `SlideQuestionPreviewDialog.tsx`:

1. **State not reset when dialog opens:** The useEffect only updates state when `extractedData` changes, but if the previous data was blank and new data also has the same structure, React may not detect a meaningful change.

2. **Insufficient option validation:** Line 96 only checks if exactly 4 options exist:
```typescript
setMcqOptions(mcq.options?.length === 4 ? mcq.options : ['', '', '', '']);
```
If the AI returns 4 empty strings `['', '', '', '']` or the options are malformed, they display as blank.

3. **No re-initialization on dialog open:** State persists between opens, so stale blank data from a previous failed extraction may show.

### Solution

Reset ALL form state when the dialog opens (not just when extractedData changes):

**File: `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx`**

Add an effect that resets state when `open` changes to `true`:

```typescript
// Reset all state when dialog opens
useEffect(() => {
  if (open && extractedData) {
    // Force re-initialize based on current extractedData
    if (questionType === 'mcq' && extractedData.mcq) {
      const mcq = extractedData.mcq;
      setMcqQuestion(mcq.question || '');
      // Ensure we have valid non-empty options, or default to placeholders
      const validOptions = mcq.options?.filter(opt => opt && opt.trim() !== '') || [];
      if (validOptions.length >= 4) {
        setMcqOptions(mcq.options!);
      } else {
        // Pad with empty strings if we have some options
        const paddedOptions = [...validOptions, '', '', '', ''].slice(0, 4);
        setMcqOptions(paddedOptions);
      }
      setMcqCorrectAnswer(mcq.correct_answer || 'A');
      setMcqExplanation(mcq.explanation || '');
    } else if (questionType === 'short_answer' && extractedData.short_answer) {
      const sa = extractedData.short_answer;
      setSaQuestion(sa.question || '');
      setSaExpectedAnswer(sa.expected_answer || '');
      setSaExplanation(sa.explanation || '');
    } else if (questionType === 'coding' && extractedData.coding) {
      // ... coding state initialization
    }
  }
}, [open, extractedData, questionType]);
```

Also add better logging in `SlidePresenter.tsx` to track what data is being passed:

```typescript
// In handleSendSlideQuestion, after transforming data:
console.log('📋 Transformed question data for preview:', JSON.stringify(transformedData, null, 2));
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SlidePresenter.tsx` | Add useEffect to reset `isProcessingSlideQuestionRef` when preview dialog closes |
| `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx` | Reset form state on dialog open with better option validation |

---

## Result After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Say "send slide question" twice | 2nd command ignored forever | 2nd command works after dialog closes |
| Close dialog with Cancel | Guard stays true | Guard resets to false |
| Click outside dialog | Guard stays true | Guard resets to false |
| Options extracted as empty | Shows 4 blank inputs | Shows padded options with extracted data |
| Dialog opens with stale state | May show previous blank data | Fresh state on each open |
