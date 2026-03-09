

## Plan: Redesign Instructor Students Screen

### Current State
The Students tab renders three stacked cards: `StudentRankingCard` (simple alphabetical list with name + average grade), `AnswerReleaseCard` (assignment answer release controls), and `AcademicIntegrityInsights` (flagged student behavior). The roster is a basic list with no search, filter, or sort. `AnswerReleaseCard` is unrelated to student management.

### Architecture

Replace the stacked-cards layout with a dedicated `StudentRosterPanel` component that owns the full students tab experience.

```text
┌──────────────────────────────────────────────────────────┐
│  Students                                                │
│  View enrollment, participation, and activity.  24 students │
├──────────────────────────────────────────────────────────┤
│  [Search...]  [Sort: Name ▾]  [Filter: All ▾]           │
├───────────────────────────────┬──────────────────────────┤
│  Student List (scrollable)    │  Detail Panel            │
│                               │  (selected student)      │
│  ● Jane Doe                   │                          │
│    Avg: 87% · 3 responses     │  Name, grade, streak     │
│  ● John Smith  ← selected     │  Recent responses        │
│    Avg: 72% · 5 responses     │  Activity timeline       │
│  ...                          │  Problem attempts        │
│                               │                          │
├───────────────────────────────┴──────────────────────────┤
│  ┌─ Academic Integrity Insights (collapsible) ─────────┐ │
│  │  Flagged students...                                 │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Changes

#### 1. Create `src/components/instructor/StudentRosterPanel.tsx`

New component that receives `students`, `onStudentClick`, `onRefresh`, `instructorId`, and `selectedStudentDetail` as props.

**Page header**: Title "Students", subtitle, student count badge.

**Toolbar**: 
- Search input filtering by name (client-side)
- Sort dropdown: Name (A-Z), Name (Z-A), Grade (high-low), Grade (low-high)
- Filter dropdown: All, Has Grades, No Grades

**Master-detail layout** (side-by-side on desktop, stacked on mobile):
- **Left list** (~40% width): Scrollable student rows with avatar, name, average grade (shown as a small badge, not "No grades yet" text — just omit the badge if no grades), response count if available. Selected row highlighted.
- **Right detail panel** (~60% width): Shows selected student's detail inline (reuse data from `fetchStudentDetail`): stats cards (level, XP, streak), recent activity, problem attempts. Empty state: "Select a student to view details."

**Academic Integrity**: Render `AcademicIntegrityInsights` below the master-detail area, separated by a divider.

**Answer Release Card**: Remove from students tab entirely. It belongs in the Live or Results workflow — move it to the `live` tab case (after `LiveSessionResults` and `PastLiveSessions`).

#### 2. Update `src/pages/InstructorDashboard.tsx`

- Replace the `case "students"` block to render `<StudentRosterPanel>` instead of three separate cards
- Move `<AnswerReleaseCard>` into the `case "live"` section
- Pass all needed props (students, handlers, instructorId, selectedStudentDetail) to the new panel
- Keep existing `fetchStudents`, `handleStudentClick`, `fetchStudentDetail` logic in the dashboard — just wire them to the new component

#### 3. Deprecate `StudentRankingCard.tsx`

Its functionality is absorbed into `StudentRosterPanel`. The file can remain but will no longer be imported.

### Files to Create/Edit
- `src/components/instructor/StudentRosterPanel.tsx` — New file (master-detail roster with search/sort/filter)
- `src/pages/InstructorDashboard.tsx` — Update students tab case, move AnswerReleaseCard to live tab

No backend changes. All existing queries and data flow remain identical.

