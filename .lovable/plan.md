
# Fix: Auto-Question and Lecture Summary 401 Authentication Errors

## Problem Summary
Auto-questions are being skipped with "failed to send a request to edge function" errors, and lecture summaries fail to load. The Supabase analytics confirm both edge functions are returning **401 Unauthorized** errors:
- `generate-interval-question` → 401
- `generate-live-lecture-summary` → 401

## Root Cause Analysis

The `LectureTranscription.tsx` component has its own auto-question generation logic that **does NOT refresh the authentication session** before calling edge functions. This is different from the `useLectureRecording.ts` hook (used by Slide Presenter) which properly refreshes the session.

**Missing session refresh in two locations:**
1. `generateAndSendAutoQuestion()` (around line 1374-1481) - No session refresh before calling `generate-interval-question`
2. `stopRecording()` summary generation (around line 2540) - No session refresh before calling `generate-live-lecture-summary`

While `useAuthRefresh(true)` runs in the component to refresh tokens every 10 minutes, this is insufficient because:
- Browser tab throttling can delay `setInterval` execution
- There's still a window between refreshes where tokens can expire
- Sessions can become completely invalid after extended periods
- The proactive refresh doesn't help if the token expired between refreshes

## Solution

Add `supabase.auth.refreshSession()` calls immediately before each edge function invocation in `LectureTranscription.tsx`, following the same pattern successfully used in `SlidePresenter.tsx` and `useLectureRecording.ts`.

## Technical Implementation

### File: `src/components/instructor/LectureTranscription.tsx`

**Change 1: Add session refresh before auto-question generation (around line 1407)**

In the `generateAndSendAutoQuestion` function, add session refresh before fetching the user:

```typescript
// Inside generateAndSendAutoQuestion function, before line 1408
console.log("🔑 Refreshing auth token before auto-question generation");
const { error: refreshError } = await supabase.auth.refreshSession();
if (refreshError) {
  console.error("❌ Auth refresh failed:", refreshError);
  toast({
    title: "⚠️ Session expired",
    description: "Please refresh the page to continue",
    variant: "destructive",
  });
  return false;
}
```

**Change 2: Add session refresh before lecture summary generation (around line 2512)**

In the `stopRecording` function, add session refresh before the summary edge function call:

```typescript
// Inside the try block before calling generate-live-lecture-summary (around line 2512)
console.log("🔑 Refreshing auth token before lecture summary generation");
const { error: summaryRefreshError } = await supabase.auth.refreshSession();
if (summaryRefreshError) {
  console.warn("⚠️ Auth refresh before summary failed:", summaryRefreshError.message);
  // Continue anyway - the edge function call might still work
}

// Fetch today's check-in results for this instructor
const { data: { user } } = await supabase.auth.getUser();
```

## Summary of Changes

| Location | Line (approx) | Change |
|----------|---------------|--------|
| `generateAndSendAutoQuestion()` | ~1407 | Add `await supabase.auth.refreshSession()` before `getUser()` |
| `stopRecording()` summary block | ~2512 | Add `await supabase.auth.refreshSession()` before summary generation |

## Why This Fixes the Issue

1. **Immediate refresh before each edge function call** ensures the JWT is always valid at the moment of invocation
2. **Follows the proven pattern** already used successfully in `SlidePresenter.tsx` and `useLectureRecording.ts`
3. **Handles browser throttling** by not relying solely on `setInterval`-based proactive refresh
4. **Works for long sessions** (20-60+ minutes) where tokens are more likely to expire between refresh cycles

## Expected Behavior After Fix

1. Auto-questions will generate and send successfully at each interval
2. Lecture summaries will load after recording stops (for 10+ minute sessions)
3. No more "failed to send a request to edge function" errors
4. The 401 errors in the edge function logs will be replaced with 200 success responses

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructor/LectureTranscription.tsx` | Add session refresh before both edge function calls |
