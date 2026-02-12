

## Plan: Make Material Content Actually Reach the AI

### Problem

The system is **already wired** to pass uploaded materials to the AI, but it silently fails at two points:

1. **Missing edge function**: `parse-lecture-material` doesn't exist. The client calls it to extract text from PDFs, gets an error, catches it silently, and sends an empty `materialContext` to the AI.
2. **course_id filter mismatch**: The materials query filters by `course_id`, but the uploaded materials have `course_id = NULL`, so they get excluded when a course is selected.

### Solution

#### Part 1: Create `parse-lecture-material` Edge Function

Create a new edge function at `supabase/functions/parse-lecture-material/index.ts` that:

- Receives a `filePath` (the Supabase Storage path of the uploaded file)
- Downloads the file from the `lecture-materials` storage bucket using the service role key
- For PDF files: extracts text content (using a lightweight approach -- read the raw bytes and extract readable text strings)
- For text-based files: returns the content directly
- Returns `{ text: "extracted content..." }` to the caller
- Has a reasonable size limit (return first ~4000 chars of extracted text)

Add the function to `supabase/config.toml` with `verify_jwt = false`.

#### Part 2: Fix the course_id Filter

In `LectureTranscription.tsx`, update the materials query to also include materials where `course_id IS NULL` (instructor-level materials not yet assigned to a course). Change the filter logic from:

```text
if (selectedCourseId) {
  materialsQuery.eq("course_id", selectedCourseId);
}
```

to an OR filter that includes both course-specific AND unassigned materials:

```text
if (selectedCourseId) {
  materialsQuery.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
}
```

This ensures the "Genetic Algorithms UA.pdf" and "Simulated Annealing UA.pdf" files are included even though they have `course_id = NULL`.

#### Part 3: Add Better Error Logging

Replace the silent `console.warn` in the material parsing catch block with more visible logging so parsing failures are immediately obvious during live sessions:

```text
console.error("[MATERIAL PARSE FAILED]", material.title, error);
```

### Technical Details

**Edge Function (`parse-lecture-material`):**
- Downloads file from Supabase Storage using service role
- For PDFs: extracts text by scanning for text stream objects (lightweight, no external dependencies)
- For plain text / markdown: returns content directly
- Returns JSON `{ text: string, file_type: string, chars: number }`
- Timeout: 15 seconds
- Max output: 4000 characters per material

**Files to create:**
- `supabase/functions/parse-lecture-material/index.ts`

**Files to modify:**
- `supabase/config.toml` -- add function entry
- `src/components/instructor/LectureTranscription.tsx` -- fix course_id filter, improve error logging

### Impact

With this fix, when an instructor like Alice runs a live session on "Intelligent Optimization," the AI will actually receive text content from her "Genetic Algorithms UA.pdf" and "Simulated Annealing UA.pdf" uploads. Combined with the existing relevance guardrails (keyword overlap, confidence thresholding), this ensures questions are grounded in both the live transcript AND the uploaded course materials.
