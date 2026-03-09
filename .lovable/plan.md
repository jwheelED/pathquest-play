

## Plan: Redesign Teaching Summary Flow and Saved Summaries Library

### Current State

Two components involved:
- **`LectureSummarySheet.tsx`** — Post-lecture side sheet with flat card list (stats, topics, concepts, highlights, engagement, suggestions, review items). Save button in header.
- **`SavedSummariesTab.tsx`** — Simple card list with title/date/stats. Clicking opens a detail Sheet that duplicates the same flat card layout.

Both feel like long scrollable card dumps with no clear report structure or actionable framing.

### Changes

#### 1. Redesign `LectureSummarySheet.tsx` — Post-Lecture Report

Keep the Sheet container but restructure content into a proper report with grouped sections and contextual interpretation.

**Header area:**
- Title generated from first 1-2 topics + date (e.g., "Recursion & Trees — Mar 9")
- Date, duration, questions, students as inline metadata row
- Action buttons: Save Summary, Export (PDF via jspdf)

**Section 1 — Class Performance** (combined card):
- Check-in accuracy with progress bar + contextual label ("Strong understanding" / "Mixed results — consider review" / "Students struggled — review recommended")
- Response count (X of Y correct)

**Section 2 — Content Summary** (single grouped card with sub-sections):
- Topics Covered (badges)
- Key Concepts (checklist)
- Lecture Highlights (bullet list)

**Section 3 — Instructional Reflection** (single grouped card):
- Engagement Analysis (paragraph)
- Teaching Suggestions (checklist)

**Section 4 — Follow-Up Actions** (highlighted card, dashed border):
- "Consider Reviewing" items (existing `conceptsToReview`)
- Quick action buttons: "View Summaries Library" (navigates to summaries tab)

**Title generation improvement** in `handleSave`: Use format `"Topic1 & Topic2 — Mon D"` with date, truncated to 60 chars. Falls back to `"Lecture Summary — Mon D"`.

#### 2. Redesign `SavedSummariesTab.tsx` — Summaries Library

**Library header:**
- "Summaries" title with count badge
- Search input (filter by title/topics)
- Sort dropdown: Newest / Oldest
- Filter by: All / Has Follow-ups (conceptsToReview.length > 0)

**Summary cards redesign:**
- Two-line title: title + date on second line
- Inline stats row: duration, questions, students
- Topic badges (up to 3 + overflow count)
- One-line engagement snippet (first 80 chars of `engagementAnalysis`)
- "Needs Follow-up" badge if `conceptsToReview.length > 0`
- Delete button (existing)

**Detail view — replace Sheet with inline expansion or Dialog:**
- Use a full-width Dialog instead of side Sheet for the saved summary detail
- Same structured report layout as the post-lecture view (grouped sections)
- Add Export button in the detail view header

#### 3. Files to Edit

- `src/components/instructor/LectureSummarySheet.tsx` — Restructure into grouped report sections, improve title generation, add contextual accuracy labels, add export action
- `src/components/instructor/SavedSummariesTab.tsx` — Add search/sort/filter toolbar, redesign cards with engagement snippet and follow-up badge, replace detail Sheet with Dialog using grouped report layout

No backend changes. No new files needed. Both components reuse existing data structures and `LectureSummaryData` type unchanged.

