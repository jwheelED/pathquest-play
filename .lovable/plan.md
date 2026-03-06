

## Plan: Redesign Instructor Overview Tab

### Problem
The Overview tab is a passive status screen with contradictory metrics, no action scaffolding, dead whitespace, and no empty/loading states. It needs to become a decision-support tool.

### Part 1: Redesign Overview Layout (12-col grid)

**File: `src/pages/InstructorDashboard.tsx`** — lines 435-448 (overview case)

Replace the current loose layout with a 12-column grid:
- Left column (col-span-4): Join Code card + Quick Actions card
- Right column (col-span-8): KPI row + Last Session Summary

```
┌──────────────────────────────────────────────┐
│  Left (4 cols)    │  Right (8 cols)          │
│  ┌──────────────┐ │  ┌────┐ ┌────┐ ┌────┐   │
│  │ Join Code    │ │  │Eng.│ │Act.│ │Comp│   │
│  └──────────────┘ │  └────┘ └────┘ └────┘   │
│  ┌──────────────┐ │  ┌──────────────────┐    │
│  │ Quick Actions│ │  │ Last Session      │    │
│  └──────────────┘ │  └──────────────────┘    │
└──────────────────────────────────────────────┘
```

### Part 2: Refactor CourseCodeCard

**File: `src/components/instructor/CourseCodeCard.tsx`**

- Rename header: "Course Code" → "Student Join Code"
- Add helper text: "Students enter this code in Edvana to join your class."
- Rename button: "Copy Code" → "Copy Join Code"
- Add secondary "Copy Invite Link" button (constructs a join URL)
- Replace gear icon dropdown trigger with a tooltip explaining it
- Toast already exists via sonner — just update message to "Join code copied to clipboard ✓"

### Part 3: Replace InstructorOverview with KPI Cards Row

**File: `src/components/instructor/InstructorOverview.tsx`** — full rewrite

Remove the donut chart. Replace with 3 `MetricCard`-style KPI cards in a row:

1. **Engagement Score** — value as "X / 100", subtext "Based on participation + responses", trend arrow vs. prior period
2. **Active Today** — show real count or "--" with subtext "Start a session to track"
3. **Assignment Completion** — show "X% — Y of Z students", color amber if < 50%, link "View assignments →" that switches to students tab

Each card has a proper skeleton loading state (using existing `Skeleton` component).

Empty state: If no students, show `EmptyState` component: "No students yet — share your join code to get started."

### Part 4: Build Quick Actions Card

**File: `src/components/instructor/InstructorQuickActions.tsx`** (new)

A card with 4 stacked full-width action buttons:
- "Start Live Session" — primary (bg-emerald-600), navigates to live tab
- "Create Question" — outline, navigates to question-bank tab
- "Upload Slides" — outline, navigates to question-bank tab (triggers upload flow)
- "Invite Students" — outline, copies join code + shows toast

Uses existing `Button` component with custom styling. Icon + label layout.

### Part 5: Build Last Session Summary Card

**File: `src/components/instructor/LastSessionSummary.tsx`** (new)

Fetches the most recent completed `live_sessions` row + its question/participant counts (reuses query logic from `PastLiveSessions.tsx`).

Displays:
- "Last Session — [date]"
- Questions asked: N
- Students participated: X / Y
- "View full summary →" link (expands or navigates)

Empty state: "No sessions yet. Start your first live session above."

Skeleton loading state while fetching.

### Part 6: Sidebar Nav Cleanup

**File: `src/pages/InstructorDashboard.tsx`** — nav items array (line 53)

- Rename "Live Lecture" → "Live Session" to differentiate from "Start Live" CTA
- Add `border-r border-border` to sidebar (already has `border-r border-border/50` — make it full opacity)

### Part 7: Empty & Loading States for All Overview Blocks

Each new component includes:
- `animate-pulse` skeleton (3-4 placeholder bars) while loading
- Zero-data `EmptyState` with contextual CTA (e.g., "Share your join code", "Start a live session")
- Error state with retry button

### Summary of Files

| File | Action |
|------|--------|
| `src/pages/InstructorDashboard.tsx` | Restructure overview grid, rename nav item, update sidebar border |
| `src/components/instructor/CourseCodeCard.tsx` | Rename labels, add invite link, improve copy UX |
| `src/components/instructor/InstructorOverview.tsx` | Full rewrite → 3 KPI cards with skeletons/empty states |
| `src/components/instructor/InstructorQuickActions.tsx` | New — 4-button action hub |
| `src/components/instructor/LastSessionSummary.tsx` | New — most recent session summary with empty state |

### Not changing
- Other tabs (live, recorded, students, settings, question-bank) — untouched
- `DashboardShell`, `MetricCard`, `EmptyState` — reused as-is
- Database schema — no migrations needed, all data already available

