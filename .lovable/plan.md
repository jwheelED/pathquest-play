

# MCQ Grading Reliability Fix Plan

## Problem Summary

Students are experiencing incorrect grading where their correct MCQ answers are marked as wrong. For example, a student who answered "B) 206 bones" for a question where the correct answer is "B" was marked incorrect.

## Root Cause Analysis

After investigation, I identified **two root causes**:

### 1. Outdated Edge Function Deployment
The `submit-live-response` edge function deployed in production was outdated and didn't include the latest answer normalization logic. After redeploying the function, the same test case `"B) 206 bones"` now correctly returns `isCorrect: true`.

**Evidence**: 
- Historical responses with `answer: "C. C++ provides..."` and `correctAnswer: "C"` have mixed `is_correct` values (both true and false for identical inputs)
- Testing the redeployed function shows correct behavior

### 2. Edge Cases in Answer Normalization (Potential Future Issues)
The current `normalizeAnswer` function handles most cases but has potential gaps:

| Scenario | Example Answer | Options | Current Behavior | Risk |
|----------|----------------|---------|------------------|------|
| Letter prefix with `)` | `"B) 206 bones"` | `["A) ...", "B) ..."]` | ✅ Extracts "B" | Fixed |
| Letter prefix with `.` | `"B. Answer"` | `["A. ...", "B. ..."]` | ✅ Extracts "B" | Fixed |
| No letter prefix in options | `"Dennis Lehane"` | `["Stephen King", "Dennis Lehane", ...]` | ✅ Matches by index | Works |
| Student types raw text | `"206"` | `["A. 100", "B. 206", ...]` | ⚠️ May not match | Potential issue |

## Proposed Solution

### Phase 1: Immediate Deployment Verification ✅
The edge function has been redeployed. Future deployments should be automatic.

### Phase 2: Enhanced Normalization Logic
Add additional fallback matching to handle edge cases:

```text
File: supabase/functions/submit-live-response/index.ts

Changes to normalizeAnswer function:
1. Keep existing letter extraction logic (works for most cases)
2. Add partial text matching as fallback (extract key numbers/words)
3. Add logging for debugging failed matches
```

**Specific improvements:**

1. **Numeric answer matching**: If student types just "206" and options contain "B. 206", extract the number and match
2. **Case-insensitive full text match**: Already exists but can be strengthened
3. **Enhanced logging**: Log all normalization steps for easier debugging

### Phase 3: Defensive UI Changes
Ensure the answer sent from the client is always in a predictable format:

```text
File: src/pages/LiveStudent.tsx

Instead of sending the full option text, extract and send just the letter prefix:
- Current: value={option} → sends "B) 206 bones"  
- Better: Extract letter, send structured { letter: "B", fullText: "B) 206 bones" }

This makes server-side comparison trivial and eliminates normalization edge cases.
```

## Implementation Details

### Enhanced normalizeAnswer Function

```typescript
const normalizeAnswer = (answer: string, questionType: string, options?: string[]): string => {
  if (questionType !== 'multiple_choice') {
    return answer.trim();
  }
  
  const trimmed = answer.trim();
  
  // 1. Already just a letter (A-D)
  if (/^[A-Da-d]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  
  // 2. Extract letter from prefixed formats: "B) text", "B. text", "B - text", "B text"
  const letterMatch = trimmed.match(/^([A-Da-d])[\).\-\s]/);
  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }
  
  // 3. Match full option text (with or without prefix) 
  if (options && options.length > 0) {
    const letters = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < options.length && i < 4; i++) {
      const option = options[i];
      
      // Strip any prefix from option for comparison
      const optionText = option.replace(/^[A-Da-d][\).\-\s]+\s*/, '').trim();
      
      // Full match (case insensitive)
      if (trimmed.toLowerCase() === option.toLowerCase() || 
          trimmed.toLowerCase() === optionText.toLowerCase()) {
        console.log(`📍 Matched "${trimmed}" to option ${letters[i]} via text match`);
        return letters[i];
      }
    }
  }
  
  // 4. Fallback: first character if A-D
  if (/^[A-Da-d]/i.test(trimmed)) {
    console.log(`📍 Using first char fallback for "${trimmed}"`);
    return trimmed.charAt(0).toUpperCase();
  }
  
  console.warn(`⚠️ Could not normalize answer: "${trimmed}"`);
  return trimmed;
};
```

### Client-Side Improvement (Optional but Recommended)

```typescript
// In LiveStudent.tsx, when submitting MCQ
const handleConfidenceSelect = (level, multiplier) => {
  // Extract just the letter from the selected option
  const letterMatch = selectedAnswer.match(/^([A-Da-d])/);
  const answerLetter = letterMatch ? letterMatch[1].toUpperCase() : selectedAnswer;
  
  const responseData = {
    questionId: currentQuestion.id,
    participantId,
    answer: answerLetter, // Send just "B" instead of "B) 206 bones"
    // ... rest of data
  };
};
```

## Files to Modify

1. **`supabase/functions/submit-live-response/index.ts`**
   - Enhance `normalizeAnswer` with better logging
   - Add fallback matching patterns
   
2. **`src/pages/LiveStudent.tsx`** (Optional)
   - Extract letter prefix before sending
   - Add defensive validation

## Testing Plan

After implementation:
1. Test with `"B) 206 bones"` format → should return correct
2. Test with `"B. Answer text"` format → should return correct  
3. Test with `"B"` (just letter) → should return correct
4. Test with raw text `"206"` → should match to correct option
5. Test with no-prefix options like `"Dennis Lehane"` → should match by index

## Success Criteria

- All MCQ answers with correct letter prefix are marked as correct 100% of the time
- Grading is consistent regardless of option format (`.`, `)`, space, etc.)
- Clear logging exists to debug any future grading issues
- No false negatives (correct answers marked wrong)

