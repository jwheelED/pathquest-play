

## Redesign: Instructor Materials Screen

### Current State
The Materials tab renders a single `LectureMaterialsUpload` card inside `InstructorDashboard.tsx` (line 555). The card contains both the upload form and the material list in one dense block. The surrounding layout provides no page header, no workflow guidance, and no next-step actions.

### Plan

#### 1. Rewrite `LectureMaterialsUpload.tsx` as a full-page layout

Replace the single card with a proper page-level component containing these sections:

**Page Header** — Full-width section at the top:
- Title: "Lecture Materials"
- Subtitle: "Upload and manage files used for AI question generation and live teaching."
- Material count badge (e.g., "4 materials")

**Two-column layout** (stacked on mobile):

**Left column — Upload New Material**
- Card with stronger visual treatment
- Drag-and-drop zone with dashed border and upload icon (also supports click-to-browse)
- Title input, description textarea
- Supported formats callout: "PDF, PPTX, DOC, DOCX, TXT — max 50MB"
- Workflow hint below the form: "Uploaded files are automatically parsed and used for AI question generation during live sessions."
- Primary CTA: "Upload Material" button

**Right column — Uploaded Materials Library**
- Section header with material count
- Search input to filter by title/filename
- Material cards (not dense rows) — each card shows:
  - File type icon (color-coded by type: PDF red, PPTX orange, DOC blue, TXT gray)
  - Title (prominent)
  - Filename, size, upload date (formatted relative: "2 days ago")
  - Parsed status badge: "Parsed" (green) or "Processing..." (amber spinner)
  - Action buttons: Download, Delete (with confirmation)
- Empty state when no materials: icon + "No materials yet" + "Upload your first file to get started"

**Post-upload success toast enhancement:**
- After successful upload, show a toast with action buttons:
  - "Generate Questions" — navigates to the Question Bank tab
  - "View Materials" — scrolls to the library

#### 2. Update the Materials tab wrapper in `InstructorDashboard.tsx`

Replace the current wrapper (lines 552-578) to remove the extra `div` nesting and let the redesigned component handle its own layout. Keep the Research Tools card for `professorType === "research"` below the main component.

#### 3. File type icon helper

Add a small helper function inside the component that maps MIME types to colored icons (using Lucide `FileText`, `Presentation`, `File` icons with Tailwind color classes).

#### 4. No backend changes needed

All data queries, mutations, storage operations, and auto-parse logic remain identical. This is a pure UI restructuring.

### Files to Edit
- `src/components/instructor/LectureMaterialsUpload.tsx` — Full rewrite of the render output and addition of search state, file type helper, drag-and-drop handler
- `src/pages/InstructorDashboard.tsx` — Minor update to the materials case (lines 551-578) to give the component more room

