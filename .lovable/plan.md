

## Plan: Pre-Generated Slide Questions Workflow

### Problem
Currently, slide questions are generated on-the-fly during presentations via OCR (capturing the current slide image → sending to AI → instructor reviews → sends). This is slow, disruptive, and unreliable — especially for PPTX where OCR depends on a PDF fallback.

### New Workflow
After uploading slides, Edvana automatically analyzes all slides and pre-generates questions. Instructors preview, edit, add, or remove questions before presenting. During the presentation, sending a question is a single button press.

---

### Architecture

```text
UPLOAD FLOW (existing)
  SlideUploader → lecture_materials table → Storage
                                         ↓
                              NEW: trigger question generation
                                         ↓
                              Edge Function: generate-slide-questions
                              (iterates slides, sends each to AI)
                                         ↓
                              NEW: slide_preset_questions table
                                         ↓
                              Question Preview/Edit UI
                                         ↓
PRESENTATION FLOW (revised)
  SlideViewer/PptxViewer → shows "Send Question" button on slides that have questions
                         → single click sends pre-built question via send-slide-question
```

---

### Database Changes

**New table: `slide_preset_questions`**
- `id` (uuid, PK)
- `material_id` (uuid, FK → lecture_materials)
- `instructor_id` (uuid, FK → auth.users)
- `slide_number` (integer) — which slide this question belongs to
- `question_type` (text) — 'mcq', 'short_answer', 'coding'
- `question_content` (jsonb) — full question data (same shape as ExtractedQuestionData)
- `is_enabled` (boolean, default true) — instructor can disable without deleting
- `order_index` (integer, default 0) — for multiple questions per slide
- `generation_source` (text) — 'auto' or 'manual'
- `org_id` (uuid, nullable)
- `course_id` (uuid, nullable)
- `created_at`, `updated_at`

RLS: instructors can CRUD their own rows.

---

### New Edge Function: `generate-slide-questions`

**Input:** `{ material_id, slide_count }` (authenticated instructor)

**Logic:**
1. Fetch the lecture material's file from storage (PDF path or PPTX's converted PDF fallback path)
2. Load the PDF, render each slide as an image (or receive pre-rendered images from the client)
3. Determine question density: ~1 question per 3-4 slides (e.g., 20 slides → 5-6 questions), skipping title/transition slides
4. For each selected slide, call Gemini vision (reuse existing `extract-slide-question` prompt logic) to generate a question
5. Insert results into `slide_preset_questions`
6. Return summary (slide numbers with questions, total count)

**Key detail:** Since rendering PDFs server-side in Deno is impractical, the client will capture slide images and send them in batches. The edge function receives `{ material_id, slides: [{ number, image }] }` and processes them.

---

### Frontend Changes

#### 1. Post-Upload Question Generation Flow (new component: `SlideQuestionGenerator`)
- After `SlideUploader` completes, show a new step: "Generating questions from your slides..."
- Client-side: load the PDF, render each page to a canvas, capture as JPEG
- Send slides in batches of 3-4 to `generate-slide-questions` edge function
- Show progress bar (e.g., "Analyzing slide 5 of 20...")
- When complete, transition to the question preview UI

#### 2. Slide Question Preview/Editor (new component: `SlideQuestionReview`)
- Shows a scrollable list of slides (thumbnail + question)
- Slides with questions show the question card (editable inline)
- Slides without questions show an "Add Question" button
- Each question card has: edit, delete, toggle enable/disable, change type (MCQ/SA/Coding)
- "Add Question" opens the existing `SlideQuestionPreviewDialog` in creation mode
- Instructor can reorder questions per slide
- Save button persists changes to `slide_preset_questions`
- "Start Presenting" button proceeds to fullscreen

#### 3. Modified Presentation Mode (`SlidePresenter.tsx`)
- On entering presentation, fetch all `slide_preset_questions` for the material
- When navigating to a slide that has a preset question:
  - Show a subtle indicator (e.g., a question badge on the slide counter)
  - Show a prominent "Send Question" button in the recording controls
- Clicking "Send Question" opens the existing preview dialog pre-filled with the preset question data
- Instructor confirms → sends via existing `send-slide-question` edge function
- Track which questions have been sent (local state) to avoid duplicates
- **Existing OCR flow remains available** as a fallback ("Extract from Slide" button) for spontaneous questions

#### 4. Presentation List UI Update
- Each presentation card shows question count badge (e.g., "5 questions ready")
- Option to "Edit Questions" from the card without entering presentation mode

---

### PPTX-Specific Handling
- PPTX files that have a completed PDF conversion: use the PDF fallback to render slide images for AI analysis (same as current OCR approach)
- PPTX files without PDF conversion: trigger conversion first, then proceed with question generation
- The question generation step waits for PDF conversion to complete before analyzing slides

---

### What Stays the Same
- `send-slide-question` edge function — unchanged, still handles delivery
- `SlideQuestionPreviewDialog` — reused for both preset editing and live preview
- Voice commands and auto-question from transcript — still available during recording
- Selection mode OCR — still available for spontaneous extraction

---

### Implementation Order
1. Database migration (create `slide_preset_questions` table + RLS)
2. `generate-slide-questions` edge function
3. `SlideQuestionGenerator` component (post-upload analysis)
4. `SlideQuestionReview` component (preview/edit UI)
5. Update `SlidePresenter.tsx` to load and use preset questions during presentation
6. Update presentation list cards with question count badges

