
# Fix: Slide Presenter Edge Function 401 Authentication Errors

## Problem Summary
The Slide Presenter is failing to send both regular questions and slide OCR questions. All three critical edge functions are returning **401 Unauthorized** errors:
- `extract-slide-question`
- `send-slide-question` 
- `format-and-send-question`

## Root Cause
The `SlidePresenter.tsx` component **does not refresh the Supabase authentication session** before invoking edge functions. When an instructor uses the Slide Presenter for an extended period, their JWT token expires, causing all subsequent edge function calls to fail with 401 errors.

In contrast, `LectureTranscription.tsx` and `useLectureRecording.ts` both call `supabase.auth.refreshSession()`:
- Before sending questions
- Proactively every 5 minutes during recording

The Slide Presenter is missing these critical session refresh calls.

## Solution
Add `supabase.auth.refreshSession()` calls before all edge function invocations in SlidePresenter.tsx.

## Technical Implementation

### File: `src/pages/SlidePresenter.tsx`

**Change 1: Refresh session before extracting slide question (around line 171-175)**

Add session refresh before calling `extract-slide-question`:

```typescript
try {
  console.log(`📋 Extracting ${questionType} question from slide ${currentSlideNumber}${selection ? ' (region selected)' : ''}`);
  
  // Refresh auth token before edge function call
  console.log('🔑 Refreshing auth token before slide extraction');
  await supabase.auth.refreshSession();
  
  // Fetch instructor's difficulty preference
  const { data: { user } } = await supabase.auth.getUser();
  // ... rest of function
```

**Change 2: Refresh session before sending slide question (around line 259-264)**

Add session refresh before calling `send-slide-question`:

```typescript
const handleConfirmSendQuestion = useCallback(async (editedData: ExtractedQuestionData) => {
  setIsSendingFromPreview(true);
  
  try {
    // Refresh auth token before sending question
    console.log('🔑 Refreshing auth token before sending slide question');
    await supabase.auth.refreshSession();
    
    // Send the edited question to students via dedicated edge function
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-slide-question', {
      // ... rest of function
```

**Change 3: Add proactive token refresh during recording (add new useEffect)**

Add a periodic token refresh effect that runs while the instructor is recording:

```typescript
// Token refresh for extended slide presenter sessions
useEffect(() => {
  if (!isRecording) return;

  // Refresh every 5 minutes during recording
  const refreshTimer = setInterval(async () => {
    console.log('🔑 Proactive auth token refresh (Slide Presenter)');
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('⚠️ Proactive auth refresh failed:', error.message);
    }
  }, 5 * 60 * 1000); // 5 minutes

  return () => clearInterval(refreshTimer);
}, [isRecording]);
```

## Summary of Changes

| Location | Change |
|----------|--------|
| `handleSendSlideQuestion` (~line 171) | Add `await supabase.auth.refreshSession()` before `extract-slide-question` call |
| `handleConfirmSendQuestion` (~line 262) | Add `await supabase.auth.refreshSession()` before `send-slide-question` call |
| New `useEffect` (~after line 320) | Add proactive 5-minute token refresh during recording |

## Expected Behavior After Fix

1. Before every edge function call, the auth token is refreshed
2. During extended recording sessions, tokens are refreshed proactively every 5 minutes
3. Edge functions will receive valid authorization headers
4. 401 errors will no longer occur
5. Slide OCR question extraction will work
6. Sending slide questions to students will work
7. Voice command "send question" will continue working (already fixed via useLectureRecording hook)

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/SlidePresenter.tsx` | Add session refresh calls before edge function invocations and add proactive refresh useEffect |
