
# Fix Voice Question Preview Bugs

## Bug 1: Preview Regenerates When More Transcript Arrives

### Root Cause
When the preview dialog is open (`isPreviewOpen === true`), the system does **not** block new voice command detections or auto-question triggers from firing. Here's what happens:

1. Instructor says "send question now" -- voice command detected, preview opens
2. While the instructor reviews the preview, they keep talking
3. Their continued speech (e.g., "Hello. Hello. Class, how are you doing?") can trigger **another** voice command detection (the fuzzy matcher finds patterns in the new transcript)
4. The auto-question interval timer also has **no check** for `isPreviewOpen` -- if the timer fires while preview is open, it calls `generateAndSendAutoQuestion` which sends directly via `handleQuestionSend` (bypassing preview entirely)
5. A new voice command overwrites `previewQuestionData` and `pendingQuestionDataRef`, causing the preview to "regenerate" with different content

The evidence is in the edge function logs: the `extract-voice-command-question` function was called **twice** within 12 seconds (at timestamps `1771618175` and `1771618186`), producing two different questions from different transcript snapshots.

### Fix
Add guards in three places:

**A. Voice command detection (`checkForVoiceCommand` function, ~line 570)**
- Add an early return if `isPreviewOpen` is true: "Preview dialog is open, skipping voice command detection"

**B. Auto-question timer (interval check, ~line 2015)**
- Add `isPreviewOpen` to the skip conditions alongside `isSendingQuestion` and `isGeneratingAutoQuestionRef`

**C. Manual question send (`handleManualQuestionSend`, ~line 821)**
- Add an early return if `isPreviewOpen` is true

## Bug 2: HTML Tags (`<h1>`) Appearing in Preview

### Root Cause
The edge function logs show the exact problem:

```
Extracted question: How many bones are inside of the human body?</h1>?
```

The AI (Gemini 2.5 Flash) is returning raw HTML tags in its extracted question. The `extract-voice-command-question` edge function has no HTML sanitization step -- it takes the raw AI output, validates it for completeness (punctuation, length), and returns it directly. The validation passes because the question ends with `?`.

The `</h1>` tag also appears in the second extraction (`Show activity for more options.` -- this is unrelated junk text the AI included from context).

### Fix
**A. Edge function: Strip HTML tags from extracted question (`extract-voice-command-question/index.ts`, after line 261)**
- Add a sanitization step after the auto-fix logic that strips all HTML tags: `extractedQuestion = extractedQuestion.replace(/<[^>]*>/g, '').trim()`
- Also strip common AI artifacts like "Show activity for more options" which is a YouTube UI element leaking into transcripts

**B. Frontend fallback: Sanitize in `VoiceQuestionPreviewDialog` (line 60)**
- Add HTML stripping when initializing `questionText` from `extractedQuestion.question_text` as a defense-in-depth measure

## Build Error Fix

The `dist: Cannot open: No such file or directory` error needs investigation. This is likely a TypeScript compilation failure preventing the build from producing output. Will check for any type errors in the modified files and fix them.

## Files to Modify

1. **`src/components/instructor/LectureTranscription.tsx`** -- Add `isPreviewOpen` guard to voice command detection, auto-question timer, and manual send
2. **`supabase/functions/extract-voice-command-question/index.ts`** -- Add HTML tag stripping and AI artifact cleanup after extraction
3. **`src/components/instructor/VoiceQuestionPreviewDialog.tsx`** -- Add defensive HTML stripping on question text initialization
4. **Any file causing the build error** -- Fix TypeScript compilation issues

## Technical Details

### Preview guard implementation
```text
// In checkForVoiceCommand (~line 570):
if (isPreviewOpen) {
  console.log("⏸️ Preview dialog open, skipping voice command detection");
  return false;
}

// In auto-question timer (~line 2016):
if (isPreviewOpen) {
  console.log("⏸️ Skipping check: preview dialog is open");
  return;
}
```

### HTML sanitization in edge function
```text
// After auto-fix (line 261):
// Strip HTML tags (AI sometimes includes markup)
extractedQuestion = extractedQuestion.replace(/<[^>]*>/g, '').trim();

// Strip YouTube UI text artifacts
extractedQuestion = extractedQuestion
  .replace(/Show activity for more options\.?/gi, '')
  .replace(/Show more\.?/gi, '')
  .trim();
```
