## Goal

Reframe the Adoption tab from an instructor-grade scoreboard into a course-level engagement health instrument. Same underlying data, but anchored on participation/response rate with a *why* and *suggested action* on every flag.

## Files Affected

- `src/pages/AdminDashboard.tsx` — replace the instructor performance data aggregation with a course-level aggregation; update header/summary chips; handle empty states.
- `src/components/admin/InstructorPerformanceCard.tsx` → rename to `CourseEngagementHealthCard.tsx` (new component) with course rows, response-rate columns, sparkline, signal labels, and expandable why+action drawer.
- `src/components/admin/AdminFilterBar.tsx` — minor: any "instructor" filter label stays valid since chair-scoping is fine; no major change.
- Keep `InstructorPerformanceCard.tsx` for now (unused) until cleanup; reference it nowhere.

## Data Aggregation Changes (AdminDashboard.tsx)

Replace `instructorStats` map (keyed by instructor) with `courseStats` map (keyed by `course_id`):

1. Fetch `courses` for `instructor_id IN fetchedInstructorIds` and `org_id = userOrgId`. Build `courseMap: id -> {title, instructor_id}`.
2. Fetch `live_sessions` (last 28 days) with `course_id, created_at, id` filtered by `instructor_id IN fetchedInstructorIds`.
3. Fetch `live_participants` count per session and `live_questions` count per session (already a pattern in `LiveUnderstandingHealth.tsx`) to compute response rate per session.
4. Aggregate per course:
   - `responseRateCurrent` — avg over last 7 days of sessions
   - `responseRatePrior` — avg over the prior 7-day window (for trend arrow + delta)
   - `sparkline` — week-by-week response rate over the last 4 weeks (array of 4 numbers)
   - `studentsDisengaging` — count of enrolled students with no live response in 7d
   - `sevenDayActive` — % of enrolled students active in 7d (reuse `activeUserIds` scoped to that course's roster)
   - `signal`:
     - `dropping` if currentRate < priorRate * 0.7 (sharp drop ≥30%) → red
     - `softDecline` if currentRate < priorRate * 0.9 → amber
     - `strong` if currentRate >= 70 → emerald
     - `steady` otherwise → neutral

5. Keep grade data per course but only expose it inside the expanded drilldown (not in main columns).

## New Component: CourseEngagementHealthCard

Header:
- Title: **Course Engagement Health**
- Subtitle: "How students are participating across courses this period. Aggregate, formative, not evaluation."
- Summary chips: `X Courses · X Students · X% Avg Response Rate · X Needs Support`
- Remove the "0.0% Avg" grade chip.

Table columns:
| Course | Response Rate (+ trend arrow + delta) | Students Disengaging | 7-Day Active | Sparkline | Signal |

Behavior:
- Default sort: by response-rate change ascending (biggest drop first).
- Click row → expand inline panel showing:
  - **Why:** e.g. "Response rate fell from 78% to 31% over the last 3 sessions."
  - **Suggested action:** templated based on signal ("Check in with the course team", "Review last 2 session topics for confusion", "Keep current cadence").
  - **Top misconception this week** (optional, from `lecture_summaries` or `student_concept_mastery` if available — pull only if cheap; otherwise omit in v1).
  - Grade context (avg grade) shown here as supporting info, not headline.
- Sparkline: small SVG of 4 weekly response-rate values.

Signal labels (replace "Needs Attention"):
- `Engagement dropping` (red) — sharp drop
- `Softening` (amber) — soft decline
- `Steady` (neutral grey)
- `Strong participation` (emerald)

## Empty States

In `AdminDashboard.tsx` for the adoption tab:
- No LMS connected (detect via existing LMS settings check / `instructor_lms_connections` presence — reuse logic from Overview tab's empty state): show CTA card "Connect your LMS to see course engagement" + Connect button (link to settings tab).
- LMS connected but no live sessions in window: show "No sessions run this period yet." Do NOT render zero-filled red rows.

## Governance / FERPA

- Rows are courses, never students.
- Course rows show the course title; instructor name is shown only inside the expanded drilldown as "Course team: {name}", not as the row identity.
- Scope: existing `get_admin_connected_instructors` already restricts to admin's org — keep as-is. No cross-department leaderboard logic added.
- Keep `GovernanceChips` footer visible (already wired).

## Out of Scope (v1)

- Department/chair vs dean role split — keep current admin scope; spec note acknowledged but not implemented here.
- Removing/deleting `InstructorPerformanceCard.tsx` file — left in place, just unused.
- LMS-derived grade trend in drilldown — only show grade if already aggregated.

## Acceptance

- Adoption tab no longer shows named instructors as row identity or "Needs Attention" verdicts.
- Table is sorted by biggest response-rate drop first.
- Every flagged (red/amber) row exposes a why + suggested action when expanded.
- Empty/no-LMS state shows a CTA instead of zero-filled red metrics.
