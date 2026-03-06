

## Plan: Move Slide Question Generation into Question Bank

### Overview
Move the "upload slides → generate questions" workflow from Slide Presenter into the Question Bank tab. Instructors upload PDF/PPTX files directly in the Question Bank, questions are generated and stored as regular bank questions (grouped by their source PDF), and can be edited/pushed like any other bank question. The Slide Presenter becomes purely a presentation tool -- no more question generation or pushing from within it.

### Part 1: New "Upload Slides" Flow in Question Bank Tab

**File: `src/components/instructor/QuestionBankTab.tsx`**
- Add an "Upload Slides" button next to the existing "New Question" button
- Add state for: `uploadMode` (showing the uploader), `generatingFromUpload` (showing progress), `sourceFilterId` (filtering by source PDF)
- When upload completes:
  1. Store the file in `lecture-materials` storage bucket (reuse `SlideUploader` component or a simplified version)
  2. Insert a record into `instructor_question_bank` or a new linking approach (see DB section)
  3. Trigger the `SlideQuestionGenerator` flow (reuse existing component) which calls `generate-slide-questions` edge function
  4. On completion, show "We found X likely questions" toast/banner
  5. Generated questions are inserted into `instructor_question_bank` with a `source_material_id` field linking them back to the uploaded PDF

**File: `src/components/instructor/question-bank/SlideUploadFlow.tsx`** (new)
- Wraps file upload (PDF or PPTX) + PPTX-to-PDF conversion + question generation progress into one component
- Reuses PDF.js rendering + `generate-slide-questions` edge function logic from `SlideQuestionGenerator.tsx`
- On completion: bulk-inserts generated questions into `instructor_question_bank` (instead of `slide_preset_questions`)
- Shows "We found X likely questions" result screen with "Review & Edit" button

### Part 2: Database Changes

**Migration: Add `source_material_id` and `source_material_title` to `instructor_question_bank`**
```sql
ALTER TABLE instructor_question_bank
  ADD COLUMN source_material_id uuid REFERENCES lecture_materials(id) ON DELETE SET NULL,
  ADD COLUMN source_material_title text;
```
This lets us group questions by their source PDF in the UI.

### Part 3: Question Bank UI — Source PDF Grouping

**File: `src/components/instructor/QuestionBankTab.tsx`**
- Add a "Source" filter dropdown alongside existing type filter: "All Sources", "Manual", then each uploaded PDF by title
- When a source PDF is selected, show a card header: "Questions from [PDF Title] — X questions" with option to re-generate or delete all questions from that source
- Questions with `source_material_id` show a small badge like "From: Calc Lecture 5.pdf"

**File: `src/components/instructor/question-bank/QuestionBankCard.tsx`**
- Add a small source badge if `source_material_title` exists on the question

### Part 4: Edge Function Update

**File: `supabase/functions/generate-slide-questions/index.ts`**
- Add an optional `target` parameter: `"question_bank"` (default) or `"slide_preset"` (legacy, can be removed later)
- When `target === "question_bank"`: insert into `instructor_question_bank` instead of `slide_preset_questions`, setting `source_material_id`, auto-generating title from slide number, and mapping question content to the bank format
- This keeps a single generation function for both flows during transition

### Part 5: Remove Question Generation from Slide Presenter

**File: `src/pages/SlidePresenter.tsx`**
- Remove the "Generate" button from each presentation card
- Remove the `SlideQuestionGenerator` integration (the `generatingMaterialId` state and rendering)
- Remove the `SlideQuestionReview` integration (the `reviewingMaterialId` state and rendering)
- Remove the "Edit" button that opens `SlideQuestionReview`
- Remove preset question loading and sending logic (`presetQuestions`, `handleSendPresetQuestion`, `currentSlidePresets`)
- The presenter becomes: upload slides → present (with live lecture recording/transcription tools still intact)

**Files to potentially delete or deprecate:**
- `src/components/instructor/slides/SlideQuestionGenerator.tsx` — logic moves to `SlideUploadFlow.tsx`
- `src/components/instructor/slides/SlideQuestionReview.tsx` — replaced by editing questions in the bank directly
- `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx` — no longer needed in presenter

### Part 6: Editing Generated Questions

Questions land in `instructor_question_bank` as regular bank questions. Instructors edit them using the existing `CreateQuestionDialog` (already supports edit mode). No new editing UI needed -- clicking "Edit" on a generated question opens the same dialog.

### Summary of Files Modified
- `src/components/instructor/QuestionBankTab.tsx` — upload button, source filter, generation flow
- `src/components/instructor/question-bank/SlideUploadFlow.tsx` — new file, upload + generate + results
- `src/components/instructor/question-bank/QuestionBankCard.tsx` — source badge
- `src/components/instructor/question-bank/index.ts` — export new component
- `supabase/functions/generate-slide-questions/index.ts` — support inserting into question bank table
- `src/pages/SlidePresenter.tsx` — remove generate/review/preset question features
- DB migration: add `source_material_id` and `source_material_title` columns

### No changes to
- Question pushing (still uses `push-bank-question` edge function)
- Slide Presenter's upload and presentation features (still works for presenting)
- Live lecture recording/transcription in Slide Presenter (untouched)

