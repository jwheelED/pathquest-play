
# Fix Live Session UI and Grading Issues

## Bug Analysis

### Bug 1: Live Session Screen Disappears After Starting
**Root Cause:** Race condition in `LiveSessionControls.tsx`

The `useEffect` on line 32-43 has `activeSession` as a dependency:
```typescript
useEffect(() => {
  loadActiveSession();
  // ...
}, [activeSession, selectedCourseId]);
```

When the session is created:
1. `handleStartSession()` calls `setActiveSession(data.session)` (line 100)
2. This triggers the useEffect because `activeSession` changed
3. `loadActiveSession()` runs and queries the database
4. Due to eventual consistency or timing, the query might not find the session yet
5. Line 64 calls `setActiveSession(null)`, clearing the session card!

**Solution:** 
- Remove `activeSession` from the useEffect dependencies
- Only reload on `selectedCourseId` change or initial mount
- Add a flag to skip reloading when we just created a session

---

### Bug 2: Correct Answers Marked Wrong in Live Session
**Root Cause:** Answer format mismatch in submit-live-response edge function

From the logs:
```
Grading: student answered "B) 206 bones", correct answer is "B", result: false
```

The question stores:
- `correctAnswer: "B"` (just the letter)
- `options: ["A) 100 bones", "B) 206 bones", ...]` (full text)

The student submits the **full option text** `"B) 206 bones"` (from RadioGroup value), but the comparison checks against just `"B"`.

**Solution:** 
Before comparing, extract the letter prefix from the student's answer:
```typescript
// Extract letter from answer like "B) 206 bones" -> "B"
const normalizedAnswer = answer.trim().charAt(0).toUpperCase();
const isCorrect = normalizedAnswer === correctAnswer;
```

This needs to be fixed in the `submit-live-response` edge function. Since this function isn't in the repository, it will need to be created/updated.

---

## Implementation Plan

### Part 1: Fix Live Session Card Disappearing

**File: `src/components/instructor/LiveSessionControls.tsx`**

1. Add a ref to track if we just created a session:
```typescript
const justCreatedSessionRef = useRef(false);
```

2. Modify the useEffect to skip loading when we just created:
```typescript
useEffect(() => {
  // Skip if we just created a session - don't re-query
  if (justCreatedSessionRef.current) {
    justCreatedSessionRef.current = false;
    return;
  }
  loadActiveSession();
  
  const interval = setInterval(() => {
    if (activeSession) {
      updateParticipantCount();
    }
  }, 5000);

  return () => clearInterval(interval);
}, [selectedCourseId]); // Remove activeSession from dependencies
```

3. Set the flag in `handleStartSession`:
```typescript
// Before setting state
justCreatedSessionRef.current = true;
setActiveSession(data.session);
```

This prevents the immediate re-query that clears the session.

---

### Part 2: Fix Answer Grading Comparison

**New File: `supabase/functions/submit-live-response/index.ts`**

Create the edge function with proper answer normalization:

```typescript
// When comparing MCQ answers, normalize to just the letter
const normalizeAnswer = (answer: string, type: string): string => {
  if (type !== 'multiple_choice') return answer;
  
  // Handle formats like "B) 206 bones" or "B. Answer" or just "B"
  const trimmed = answer.trim();
  
  // If it's already just a letter (A-D), return as-is
  if (/^[A-Da-d]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  
  // Extract letter from start: "B) text" or "B. text" or "B - text"
  const match = trimmed.match(/^([A-Da-d])[).\-\s]/);
  if (match) {
    return match[1].toUpperCase();
  }
  
  // Fallback: return first character if it's a letter
  if (/^[A-Da-d]/i.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase();
  }
  
  // Return original if no pattern matches
  return trimmed;
};

// In the grading logic:
const studentAnswerNormalized = normalizeAnswer(answer, questionType);
const correctAnswerNormalized = normalizeAnswer(correctAnswer, questionType);
const isCorrect = studentAnswerNormalized === correctAnswerNormalized;
```

---

## Files to Modify/Create

| File | Changes |
|------|---------|
| `src/components/instructor/LiveSessionControls.tsx` | Add ref to skip re-query after session creation, remove `activeSession` from useEffect deps |
| `supabase/functions/submit-live-response/index.ts` | Create/update with normalized answer comparison for MCQ |

---

## Result After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Start live session | Card disappears, only toast shows | Card stays visible with QR dialog |
| Student selects "B) 206 bones" | Marked incorrect (comparing to "B") | Marked correct (extracts "B" from answer) |
| Confidence betting with correct answer | -15 XP penalty (wrong grading) | +30 XP reward (3x multiplier) |
