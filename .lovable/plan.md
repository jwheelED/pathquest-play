
# Exempt Slide Presenter from Question Preview

## Overview

Make the Slide Presenter bypass the question preview setting so that questions are sent immediately, regardless of whether the instructor has question preview enabled globally.

## Current Behavior

When an instructor has **Question Preview enabled** in their settings:
- Voice commands in Slide Presenter → Opens preview dialog
- Manual "Send Question" button → Opens preview dialog

The preview check happens in `useLectureRecording.ts` at lines 1069-1077:
```typescript
if (questionPreviewEnabledRef.current && onQuestionExtracted) {
  // Opens preview dialog
  onQuestionExtracted({ ... });
  return;
}
// Otherwise sends immediately
```

## Solution

Add a `bypassPreviewSetting` option to the `useLectureRecording` hook that, when `true`, forces questions to send immediately without showing the preview dialog.

---

## Changes

### File 1: `src/hooks/useLectureRecording.ts`

**Add new option to interface:**

```typescript
export interface UseLectureRecordingOptions {
  onQuestionGenerated?: () => void;
  slideContext?: string;
  onVoiceCommand?: (type: 'send_question' | 'send_slide_question') => void;
  onQuestionExtracted?: (data: ExtractedVoiceQuestion) => void;
  bypassPreviewSetting?: boolean;  // NEW: Skip preview dialog
}
```

**Update the destructure:**

```typescript
const { 
  onQuestionGenerated, 
  slideContext, 
  onVoiceCommand, 
  onQuestionExtracted,
  bypassPreviewSetting = false  // NEW
} = options;
```

**Update the preview check logic:**

```typescript
// Old (line 1070):
if (questionPreviewEnabledRef.current && onQuestionExtracted) {

// New:
if (questionPreviewEnabledRef.current && onQuestionExtracted && !bypassPreviewSetting) {
```

---

### File 2: `src/pages/SlidePresenter.tsx`

**Update the hook call to bypass preview:**

```typescript
} = useLectureRecording({
  onQuestionGenerated: () => {
    console.log('Question generated from slide presenter');
  },
  slideContext: currentSlideText,
  onVoiceCommand: handleVoiceCommand,
  onQuestionExtracted: handleQuestionExtracted,
  bypassPreviewSetting: true,  // NEW: Always send immediately in Slide Presenter
});
```

---

## Technical Summary

| Context | Preview Setting ON | Preview Setting OFF |
|---------|-------------------|---------------------|
| **Standard Lecture Transcription** | Shows preview dialog | Sends immediately |
| **Slide Presenter** | **Sends immediately** (bypassed) | Sends immediately |

---

## Result

After this change:
- Voice commands like "send question" in Slide Presenter will immediately extract and send the question to students
- The instructor's global "Question Preview" setting will only apply to the standard Lecture Transcription mode
- Slide Presenter is optimized for fast, presentation-focused workflows where preview would interrupt the flow

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useLectureRecording.ts` | Add `bypassPreviewSetting` option and check |
| `src/pages/SlidePresenter.tsx` | Set `bypassPreviewSetting: true` |
