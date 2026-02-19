

# Fix: AI Explanation Showing "Incorrect" for Correct Answers

## Problem Diagnosed

Students in the Monday pilot reported that the AI explanation contradicted the grading -- they answered correctly (shown with a checkmark), but the explanation said "Why the student's answer is wrong."

### Root Cause

There are **two interacting bugs**:

1. **Stale/null `wasCorrect` sent to the explanation function**: The `isCorrect` state in `LiveStudent.tsx` defaults to `null`. When passed as `wasCorrect: isCorrect` to the explanation edge function, `null` is treated as falsy (line 68 of `generate-detailed-explanation`), which triggers the **"incorrect answer" prompt template** -- even when the student actually answered correctly.

2. **Cache key ignores correctness**: The explanation cache hashes only `problemText|correctAnswer|userAnswer` but NOT `wasCorrect`. So if the first request was processed with `wasCorrect=false` (due to bug #1), all subsequent requests with the same question+answer combination get the cached "incorrect" explanation, even from students who were correctly graded.

### Why it appeared in the pilot

A student clicks "Show Explanation" and the `isCorrect` state is read. If there's any timing issue where `isCorrect` hasn't fully propagated through React's state update cycle, it sends `null` (falsy) to the edge function. The edge function then generates and **caches** an "incorrect" explanation. Every student after that gets the cached wrong explanation.

## Fix Plan

### Fix 1: Include `wasCorrect` in the cache key
**File:** `supabase/functions/generate-detailed-explanation/index.ts`

Change the hash from:
```
`${problemText}|${correctAnswer}|${userAnswer}`
```
to:
```
`${problemText}|${correctAnswer}|${userAnswer}|${wasCorrect}`
```

This ensures correct and incorrect explanations are cached separately.

### Fix 2: Pass `wasCorrect` as an explicit boolean, never null
**File:** `src/pages/LiveStudent.tsx`

Change the explanation call from:
```typescript
wasCorrect: isCorrect,
```
to:
```typescript
wasCorrect: isCorrect === true,
```

This converts `null` to `false` explicitly. Additionally, add a guard: if the response from `submit-live-response` returned `isCorrect: true` but the state hasn't updated yet, derive it directly from the server response rather than relying on React state.

### Fix 3: Validate `wasCorrect` server-side as a fallback
**File:** `supabase/functions/generate-detailed-explanation/index.ts`

Add server-side validation: if `userAnswer` exactly matches `correctAnswer` (after normalization), force `wasCorrect = true` regardless of what the client sent. This prevents the AI from ever saying "your answer is wrong" when the answer literally matches.

Add after parsing the request body:
```typescript
// Server-side correctness validation as safety net
const effectiveWasCorrect = wasCorrect === true || 
  (correctAnswer && userAnswer && 
   userAnswer.trim().toUpperCase().charAt(0) === correctAnswer.trim().toUpperCase().charAt(0));
```

Then use `effectiveWasCorrect` for prompt selection and cache key.

### Fix 4: Improve the "correct" AI prompt to never say "wrong"
**File:** `supabase/functions/generate-detailed-explanation/index.ts`

Add explicit instruction to the system prompt:
```
IMPORTANT: If the student answered correctly, NEVER say their answer is wrong 
or that they misunderstood. Only reinforce why the answer is correct.
```

## Files to Modify

1. `supabase/functions/generate-detailed-explanation/index.ts` -- cache key fix, server-side validation, prompt improvement
2. `src/pages/LiveStudent.tsx` -- explicit boolean conversion for `wasCorrect`

## Expected Outcome

- Correct answers always show "Why you're right" explanations
- Incorrect answers always show "Why the correct answer is..." explanations  
- Cache stores separate entries for correct vs incorrect scenarios
- Server-side safety net prevents client bugs from causing wrong explanations

