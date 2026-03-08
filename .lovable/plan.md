

## Instructor Dashboard Redesign Plan

### Current State
The overview tab renders a 12-column grid with:
- **Left (4 cols)**: CourseCodeCard (join code) + InstructorQuickActions (Create Question, Upload Slides)
- **Right (8 cols)**: InstructorOverview (Active Today, Assignment Completion metrics) + LastSessionSummary

The live tab has: LiveSessionControls, LectureTranscription, LiveSessionResults, LectureCheckInResults, PastLiveSessions.

**Problems**: The overview is sparse with disconnected cards floating in space. Metrics are generic. No readiness signal. Last session data is passive. Quick actions are buried. The live tab has all the operational value but requires a tab switch.

---

### Redesign: Overview Tab Only

The sidebar, other tabs, DashboardShell, header, and persistent LiveSessionControls/LectureTranscription mounting remain untouched. We redesign only the overview tab content (lines ~439-461 of InstructorDashboard.tsx) and the components it renders.

---

### New Overview Layout

```text
┌─────────────────────────────────────────────────┐
│  SESSION READY MODULE (full width)              │
│  Course name · Join code · Copy · Start Live    │
│  · Present Slides · Students enrolled count     │
└─────────────────────────────────────────────────┘
┌──────────────────────┐ ┌────────────────────────┐
│  LAST SESSION RECAP  │ │  QUICK METRICS (2x2)   │
│  Title, date, stats  │ │  Students · Questions   │
│  Actionable insight  │ │  Avg Response · Sessions│
│  "View details →"    │ │                        │
└──────────────────────┘ └────────────────────────┘
┌─────────────────────────────────────────────────┐
│  LIVE CHECK-IN RESULTS (condensed preview)      │
│  Empty: explanation + "Start Live Session" CTA  │
│  Active: latest 2 question results inline       │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  RECENT SESSIONS (last 5, compact table rows)   │
│  Name · Date · Students · Questions · Rate · ▶  │
└─────────────────────────────────────────────────┘
```

---

### Files to Create/Edit

#### 1. New: `src/components/instructor/SessionReadyModule.tsx`
A full-width "command center" card combining CourseCodeCard + quick actions into one module.
- Shows selected course name and join code prominently (large mono text)
- Copy code button inline
- Student count (from InstructorOverview metrics query)
- Two primary CTAs: **Start Live** (navigates to live tab) and **Present Slides** (navigates to /instructor/slides)
- Active session state: if `activeSession` exists, show LIVE badge, session code, participant count, End Session button instead
- Props: `selectedCourse`, `activeSession`, `onStartLive`, `onPresentSlides`, `studentCount`

#### 2. Edit: `src/components/instructor/LastSessionSummary.tsx`
Make it more actionable:
- Add conditional insight line: if `questionCount === 0`, show "No questions were sent. Try enabling auto-questions next time."
- If `participantCount === 0`, show "No students joined. Verify your join code is shared before the next session."
- Otherwise show a positive summary like "78% response rate across {questionCount} questions"
- Keep the "View full summary →" link

#### 3. New: `src/components/instructor/QuickMetricsGrid.tsx`
A 2x2 grid of Edvana-specific MetricCards:
- **Total Students** (from instructor_students count)
- **Questions Asked** (total live_questions for this course)
- **Avg Response Rate** (responses / participants across recent sessions)
- **Sessions Run** (count of past live_sessions for this course)
- Each card uses existing MetricCard component
- Data fetched in one useEffect with parallel Supabase queries

#### 4. New: `src/components/instructor/RecentSessionsTable.tsx`
Replaces PastLiveSessions on the overview tab with a compact, scannable table:
- Shows last 5 sessions (not 20)
- Columns: Session name, Date, Students, Questions, expandable chevron
- Clicking a row expands to show LiveSessionResults inline (reuse existing component)
- "View all sessions →" link navigates to live tab
- Reuses the same query pattern from PastLiveSessions but lighter

#### 5. New: `src/components/instructor/CheckInPreview.tsx`
A condensed version of LectureCheckInResults for the overview:
- Empty state: clean card with explanation text ("During a live session, check-in results will appear here in real time. You'll see how students respond to each question as it happens.") + "Start Live Session" CTA
- Active state: show latest 2 grouped results with basic stats (correct %, response count)
- "View all check-ins →" link navigates to live tab
- Fetches only the 2 most recent groups

#### 6. Edit: `src/pages/InstructorDashboard.tsx` (overview case only, ~lines 439-461)
Replace the current overview content with the new modules:
```tsx
case "overview":
  return (
    <div className="space-y-6">
      <PendingOrgInvites />
      <SessionReadyModule
        activeSession={activeSession}
        onStartLive={() => setActiveTab("live")}
        onPresentSlides={() => navigate("/instructor/slides")}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LastSessionSummary onNavigate={(tab) => setActiveTab(tab as TabValue)} />
        <QuickMetricsGrid />
      </div>
      <CheckInPreview onNavigate={(tab) => setActiveTab(tab as TabValue)} />
      <RecentSessionsTable onNavigate={(tab) => setActiveTab(tab as TabValue)} />
    </div>
  );
```

Remove CourseCodeCard, InstructorQuickActions, and InstructorOverview from overview (their data is absorbed into SessionReadyModule and QuickMetricsGrid).

#### 7. Edit: Sidebar styling (lines ~629-651 of InstructorDashboard.tsx)
- Increase font weight for nav items: `font-medium` → `font-semibold` for active
- Add subtle left border accent on active item instead of full bg fill
- Slightly increase padding and icon size for better presence

### Components NOT changed
- LiveSessionControls, LectureTranscription (persist outside tabs - unchanged)
- All other tabs (live, recorded, students, etc.) - unchanged
- DashboardShell - unchanged
- PastLiveSessions - still used on the live tab, just not on overview

### Technical Notes
- All new components use existing patterns: `useCourseContext`, `supabase` client, `MetricCard`, `EmptyState`, `Card`
- No new dependencies needed
- All queries filter by `selectedCourseId` for course isolation
- SessionReadyModule receives `activeSession` as prop from the already-lifted state in InstructorDashboard

