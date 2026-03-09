

## Plan: Redesign Student Class Overview and Results Screens

### Current State

- **Class Overview** (`ClassDashboard.tsx`, `activeTab === "overview"`): Renders a single "Course Information" card with instructor name, schedule, and topic tags. No progress, no next actions, no activity — feels empty.
- **Results** (`StudentLectureQuestions.tsx`): A single Card with Live/Pre-Recorded tabs. Each tab is an accordion of items showing title, date, grade. No summary stats at top. Feels like a score log.
- Both screens are clean but lack substance and actionability.

### Changes

#### 1. Redesign Class Overview — `ClassDashboard.tsx` (overview tab)

Replace the single course-info card with a hub layout containing:

**Course header row** (inline, not a giant card):
- Course title (already in page header), instructor name, schedule — compact row with icon chips. Replace "Unknown Instructor" with "Your Instructor" fallback.

**Quick stats grid** (3-4 metric cards):
- Fetch from `student_assignments` and `student_lecture_progress` for this instructor/course:
  - Items Completed (count of completed assignments + completed lectures)
  - Average Score (mean of grades)
  - Items to Review (assignments with grade < 70 or incomplete lectures)
  - Pre-Recorded Progress (X of Y lectures completed)

**Next Action banner:**
- If there are incomplete lectures → "Continue watching: [title]"
- If there are items with grade < 70 → "Review missed questions"
- Otherwise → "You're all caught up"
- Clicking navigates to the relevant tab

**Quick links row:**
- Buttons/cards linking to the other tabs: "Assigned Content", "Pre-Recorded Lectures", "View Results"

**Topic tags** remain at bottom, compact.

All data fetching added inside `ClassDashboard.tsx` in the existing `checkSession` flow — new queries for assignment stats and lecture progress.

#### 2. Redesign Results Screen — `StudentLectureQuestions.tsx`

**Add summary header** above the tabs:
- Average Score (across all completed items) with contextual color/label
- Items Completed count
- Items Needing Review count (grade < 70 or incomplete)
- Display as a 3-column stat row

**Improve result row cards** (inside the accordion triggers):
- Add a status icon: green check (≥70%), amber warning (40-69%), red X (<40%)
- Add clearer "Review" button affordance on items with low scores
- Show question count per item

**Keep** the Live/Pre-Recorded tab split — it works well conceptually.

#### 3. Files to Edit

- **`src/pages/ClassDashboard.tsx`** — Rewrite the `activeTab === "overview"` block with stats grid, next action banner, quick links. Add data-fetching for stats (assignments count, avg grade, lectures progress). Fix "Unknown Instructor" fallback.
- **`src/components/student/StudentLectureQuestions.tsx`** — Add summary stats header above tabs. Enhance accordion trigger rows with status icons and review affordance.

No new files needed. No backend changes. All stats computed from existing queries already present in both components.

