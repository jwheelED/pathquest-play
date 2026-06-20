
# PDF/CSV Export Overhaul

Fix five concrete problems in the leadership PDF: contradicting numbers, junk seed courses, duplicate course names, 33-row dump with no story, and 0-activity rows printing.

## 1. One source of truth, no contradictions

**File:** `src/pages/AdminDashboard.tsx` (`orgSnapshot` memo)

- Define a single `isPeriodActive` flag = `sessions > 0 && (activeStudents > 0 || totalResponses > 0)`.
- If `!isPeriodActive`: set `avgResponseRate`, `avgCompletionRate`, `activeStudents` ALL to `null` (renders as `—`). Right now `avgCompletionRate` is pulled from lifetime `student_assignments` while response rate/active come from the period window — that's the 56% vs 0% contradiction. Recompute `avgCompletionRate` from assignments **within the period window** (`created_at >= rangeFrom`) so it lines up with sessions/active/response.
- Add a derived `activeCourseCount` and `totalCourseCount` to `OrgSnapshot` so the PDF can say "2 of 33 courses active this period" instead of dumping all 33.

**File:** `src/hooks/useAdminDashboardData.ts`

- Return `totalResponses` and a period-scoped `completionRate` (from `student_assignments` filtered by `created_at` within window) so `AdminDashboard` doesn't mix lifetime and windowed numbers.

## 2. Suppress empty course rows + disambiguate

**File:** `src/pages/AdminDashboard.tsx` (`courseEngagementExportRows` memo)

- Filter out rows where `sessionsInWindow === 0 && activeStudents === 0 && openSupportCases === 0`.
- Sort remaining rows by `sessionsInWindow` desc, then `activeStudents` desc.
- Disambiguate duplicates: if multiple courses share the same `title`, append ` · {courseCode}` (or the last 4 chars of course id when no code) so "My Course" / "Cell Biology" rows are distinguishable. Pull `course_code` from the existing courses fetch.
- Scrub seed/test courses with a `SEED_COURSE_PATTERNS` regex list (mirror of `SEED_NAME_PATTERNS`) covering: `^my course$`, `\btest(ing)?\b`, `\bdemo\b`, `^untitled`, `necessary eleven steps`, `detective fiction`. Apply before the export rows are built and also when computing `activeCourseCount` numerator.

## 3. Narrative-first PDF layout

**File:** `src/components/admin/ExportReportsCard.tsx` (`exportToPDF`)

Restructure the PDF into three sections:

**Page 1 — Executive Summary (the story)**
- Header + governance line (keep).
- Hero KPI strip: `Active Courses` (e.g. "2 of 33"), `Sessions Run` (+Δ), `Response Rate` (or `—`), `Active Students (7d)`, `Open Support Cases`.
- "Engagement trend" mini-block: response-rate delta line + sessions delta line (text only, no chart — keep current jsPDF simple).
- "Top misconception themes" (top 3 from `misconceptions`, course-level only, no student names).
- "Where engagement is rising / falling": top 3 courses by positive Δ response rate, bottom 3 by negative Δ (from `courseEngagement` deltas).

**Page 2+ — Appendix: Course Detail**
- Force `doc.addPage()` before this table.
- Title: "Appendix A — Course-Level Engagement (active courses only)".
- Sub-line: "Showing N of M total courses. Courses with zero sessions and zero activity in this period are omitted."
- Table with disambiguated `Course` column, otherwise same columns as today (Sessions, Response Rate, Δ vs prior, Active Students, Open Support Cases).
- If `activeCourseCount === 0`: skip the table entirely and print a single line: "No courses had sessions in this period."

**Footer:** keep page numbers + "Aggregate engagement, not instructor evaluation".

## 4. CSV mirrors the PDF rules

**File:** `src/components/admin/ExportReportsCard.tsx` (`exportToCSV`)

- Use the same filtered, disambiguated, sorted `courseEngagement` array.
- Add the same "N of M active courses" summary row above the course table.
- Empty rows still suppressed.

## 5. Seed-data hygiene at the data layer

**File:** `src/pages/AdminDashboard.tsx`

- Add `SEED_COURSE_PATTERNS` next to `SEED_NAME_PATTERNS` and an `isSeedCourse(title)` helper.
- Apply `isSeedCourse` filter to both `filteredCourseEngagement` (UI) and `courseEngagementExportRows` (export), so the dashboard and PDF stay consistent.
- Leave the underlying `courses` table untouched (no DB migration) — purely a presentation filter so demo orgs keep working internally.

## Out of scope

- Real misconception clustering / "top themes" NLP — use existing `misconceptions` array (already course-tagged).
- Section/term disambiguation beyond course code suffix.
- Backend DB cleanup of seed courses.

## Technical notes

- No new dependencies; jsPDF + autoTable already imported.
- `OrgSnapshot` interface gains: `activeCourseCount: number | null`, `totalCourseCount: number | null`, `topRising: {title:string; delta:number}[]`, `topFalling: {title:string; delta:number}[]`, `topMisconceptions: {text:string; correctRate:number; courseName?:string}[]`. All optional/nullable so existing callers stay valid.
- Page-1 KPI strip rendered with `autoTable` in a 5-column single-row layout to avoid manual coordinate math.
- All `0%` outputs continue routing through `fmtPct` so they render `—` when `null`.
