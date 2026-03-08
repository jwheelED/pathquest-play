

## Student Dashboard Redesign Plan

### Current State
`StudentTraining.tsx` renders 7 stacked sections: JoinClassHero, SimpleClassList, RecommendedNextSteps + LectureCheckInHistory (2-col), LectureCheckInHistory (all), PracticeQuestionsCard, SimplifiedStudyMaterials, ConfidenceAnalytics. The page feels like a vertical stack of independent feature cards with weak hierarchy and no clear "do this next" signal.

---

### New Layout

```text
┌─────────────────────────────────────────────────┐
│  NEXT ACTION BANNER (full width, highlighted)   │
│  "Review 1 missed question" or "Join live now"  │
│  or "Upload your first study material"          │
│  Single CTA button                              │
└─────────────────────────────────────────────────┘
┌──────────────────────┐ ┌────────────────────────┐
│  MY CLASSES          │ │  JOIN A CLASS           │
│  Richer class cards  │ │  Compact code input     │
│  with instructor,    │ │  (inline, not hero)     │
│  next due item,      │ │                        │
│  review count        │ │                        │
└──────────────────────┘ └────────────────────────┘
┌─────────────────────────────────────────────────┐
│  QUESTIONS TO REVIEW (expandable list)          │
│  Wrong answers from check-ins + practice misses │
└─────────────────────────────────────────────────┘
┌──────────────────────┐ ┌────────────────────────┐
│  RECENT CHECK-INS    │ │  STUDY MATERIALS       │
│  (compact, last 5)   │ │  Compact list + upload │
│                      │ │  action-oriented empty │
└──────────────────────┘ └────────────────────────┘
┌─────────────────────────────────────────────────┐
│  PRACTICE QUESTIONS (if material-based Qs exist)│
└─────────────────────────────────────────────────┘
```

ConfidenceAnalytics is removed from the main dashboard entirely (it queries `user_stats`/`practice_sessions` tables for gamification data that most students won't have meaningful data for).

---

### Files to Create/Edit

#### 1. New: `src/components/student/NextActionBanner.tsx`
A full-width highlighted banner showing the single most important action. Replaces RecommendedNextSteps.

Logic (priority order):
1. Active live session → "Your instructor is live" + Join Now button
2. Wrong answers to review (`wrongAnswersCount > 0`) → "Review {n} missed questions" + scroll to review section
3. No classes → "Join your first class" + scroll to join input
4. No materials → "Upload study notes to generate practice questions" + scroll to materials
5. All clear → "You're all caught up" (small, muted — not a full card)

Styling: uses `bg-primary/10 border-primary/20` for urgent actions, muted for "all caught up". Single line with icon + text + CTA button. Not a full Card — more like an alert banner.

Props: `userId`, `hasClasses`, `wrongAnswersCount`, `materialsCount`, `hasLiveSession` (boolean, computed in parent).

#### 2. Edit: `src/components/student/SimpleClassList.tsx`
Enrich class cards:
- Add a query for each class's pending review count: count of `student_assignments` where `completed=true AND grade<70` for that instructor/course
- Show pending review count as a badge: "2 to review"
- Replace "Unknown Instructor" fallback with "Instructor" (cleaner)
- When no classes exist, show a smaller empty state (2 lines, no giant icon) since the join input is nearby

#### 3. Edit: `src/components/student/JoinClassHero.tsx` → Compact inline
Reduce from a large hero card to a compact inline input:
- Remove the 16x16 icon, gradient background, and "Join a New Class" heading
- Render as a simple row: label "Join a class" + input + button, inside a subtle bordered card
- This will sit alongside or below My Classes instead of dominating the top

#### 4. Edit: `src/components/student/SimplifiedStudyMaterials.tsx`
Improve empty state:
- Replace the large centered icon + "No materials yet" with a compact action-oriented message: "Upload notes or PDFs to generate practice questions" with an inline Upload button
- Keep the existing upload form and materials list unchanged

#### 5. Edit: `src/pages/StudentTraining.tsx` (layout rewrite)
New section order:
1. `NextActionBanner` (full width)
2. Two-col grid: `SimpleClassList` (left, wider) + compact `JoinClassHero` (right)
3. `LectureCheckInHistory` with `showOnlyWrong=true` (full width, "Questions to Review")
4. Two-col grid: `LectureCheckInHistory` with `showOnlyWrong=false, limit=5` (left) + `SimplifiedStudyMaterials` (right)
5. `PracticeQuestionsCard` (full width, self-hides when empty)

Remove: ConfidenceAnalytics import and rendering, RecommendedNextSteps import and rendering, duplicate LectureCheckInHistory.

Add: live session check in the parent (query `live_sessions` for enrolled instructors) to pass `hasLiveSession` to NextActionBanner. Reuse the logic already in RecommendedNextSteps.

### Components Removed from Dashboard
- `ConfidenceAnalytics` — removed entirely (file kept, just not rendered)
- `RecommendedNextSteps` — replaced by `NextActionBanner`

### Technical Notes
- No new dependencies
- All queries use existing tables (`instructor_students`, `student_assignments`, `live_sessions`)
- NextActionBanner is a lightweight component with no heavy data fetching (receives props from parent)
- The "review count per class" in SimpleClassList adds one additional query but is bounded by enrolled class count

