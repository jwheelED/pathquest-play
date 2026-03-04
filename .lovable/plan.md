

## Plan: Slide Presenter Workflow Improvements

### Changes Overview

Three modifications to the slide presenter workflow:

1. **Remove auto-generation after upload** — Instead, add a "Generate Questions" button on each presentation card
2. **Skip question preview dialog when sending preset questions** — Send directly without showing the edit dialog
3. **Add question names** — Allow instructors to name questions, and display the name in the "Send Question" button during presentation

---

### 1. Remove Auto-Generation After Upload

**File: `src/pages/SlidePresenter.tsx`**

- Modify `handleUploadComplete` (lines 509-531): Remove the logic that automatically sets `generatingMaterialId`. Just refresh presentations and close the uploader.
- Add a "Generate Questions" button to each presentation card (alongside "Edit Questions"), which sets `generatingMaterialId/FilePath/FileType` to trigger the `SlideQuestionGenerator`.
- Need to fetch `file_path` and `file_type` from the material when the button is clicked (these aren't currently stored in `SlideData`). Extend `SlideData` to include `filePath` and store it from the query.

### 2. Skip Preview Dialog for Preset Questions

**File: `src/pages/SlidePresenter.tsx`**

- Modify `handleSendPresetQuestion` (lines 480-491): Instead of opening the preview dialog, send the question directly by calling `handleConfirmSendQuestion` with the preset's question content and `isPollMode: true`.
- This makes preset question sending a true one-click action.

### 3. Add Question Names

**Database: `slide_preset_questions` table**
- Add a `question_name` column (text, nullable) via migration.

**File: `src/components/instructor/slides/SlideQuestionReview.tsx`**
- Add a name field to the question card (display + edit mode).
- When adding a new question manually, default name to empty (instructor can set it).
- Auto-generated questions get a default name like "Q1", "Q2" etc. from the edge function.
- Update the `SlidePresetQuestion` interface and mutations to include `question_name`.

**File: `supabase/functions/generate-slide-questions/index.ts`**
- Include a `question_name` field when inserting generated questions (e.g., derived from slide content or just "Slide X Question").

**File: `src/pages/SlidePresenter.tsx`**
- Include `question_name` in the preset questions fetch.
- Update the "Send Question" button text: `Send Question: {name} (Slide {number})` or `Send Question (Slide {number})` if no name.

---

### Implementation Order

1. Database migration — add `question_name` column
2. Update edge function — include `question_name` in generated questions
3. Update `SlideQuestionReview` — add name field to display/edit
4. Update `SlidePresenter.tsx` — remove auto-generation, add generate button, skip preview for presets, show question name in send button

