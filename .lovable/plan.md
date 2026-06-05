
# Admin Dashboard FERPA + Metrics Fixes

Three gaps to close: Support Queue leaks names the banner promises to hide; numbers contradict across Overview / Support / PDF; the PDF export is too thin to present.

## Gap 1 — Enforce the FERPA banner in Support Queue

**File:** `src/components/admin/SupportQueueTable.tsx`, `src/pages/AdminDashboard.tsx`

- Pass an explicit `viewerRole` prop (`admin` | `advisor` | `instructor_of_record` | `support_staff`) from `AdminDashboard`. For admin/dean role, **names are masked by default** even when `canViewIndividuals` is true.
- Render masked identity: initials + course context, e.g. `Student J.D. · Comp Sci`. Drop the "with {instructorName}" subline at admin level (Gap "smaller notes": instructor-by-proxy exposure).
- Add a per-row **Reveal** action (eye icon) that:
  - Is only enabled for advisor / instructor_of_record / support_staff roles. For pure admin, button is disabled with tooltip "Reveal requires advisor / instructor-of-record / support-staff role (FERPA)."
  - When clicked by a permitted role, unmasks that single row and writes a local audit entry to `localStorage` key `edvana_support_reveal_log_v1` (`{caseId, viewerId, viewerRole, ts}`). Backend audit table is out of scope for v1; mark with a `TODO(audit)` comment.
- Update the table header from "Student" → "Identity (masked)" when masked.
- Filter out obvious seed/demo names (`Hello Students`, `newstu dash`, anything with "test"/"demo") at the data layer in `AdminDashboard.tsx` before building `supportCases`.

## Gap 2 — Reconcile metrics across Overview / Support / PDF

**Files:** `src/pages/AdminDashboard.tsx`, `src/hooks/useAdminDashboardData.ts`, `src/components/admin/AggregateMetricsCard.tsx`, `src/components/admin/RetentionHealthCard.tsx`, `src/components/admin/ExportReportsCard.tsx`

- Centralize the org snapshot in one `useMemo` (`orgSnapshot`) inside `AdminDashboard` that computes: `totalInstructors`, `totalSessions`, `activeStudents` (last 14d activity), `avgResponseRate`, `avgCompletionRate`, `supportCaseCount`. All cards + PDF + CSV read from this object. No card recomputes these independently.
- **Empty-state rule:** if `totalSessions === 0` OR LMS not connected, surface `—` (not `0%`) for response rate, completion rate, active students. `AggregateMetricsCard` and `RetentionHealthCard` already have empty-state branches; expand them to honor a single `hasUsableData` flag from `orgSnapshot`.
- Reconcile the contradiction by fixing the source: `totalSessions` should count completed live sessions over the period; if Support Queue shows N flagged students, `activeStudents` must be ≥ the distinct students behind those flags. Add an assertion-style log (`console.warn` in dev) when these invariants break, so future regressions are visible.
- Ensure trend deltas ("+1 vs prior period") propagate to all primary metrics, not just Sessions Run.

## Gap 3 — Make the PDF export presentable

**File:** `src/components/admin/ExportReportsCard.tsx`

Reshape the PDF (and CSV) to a board-ready report:

1. **Header block:** title, reporting period (e.g. "Period: May 6 – Jun 5, 2026"), generated date.
2. **Governance line** below the title: "Aggregate, formative engagement data. Not an instructor evaluation. Behavioral signals only — no demographic or grade inputs."
3. **Key engagement metrics** (from `orgSnapshot`, with `—` for empty states, not `0%`).
4. **Course-level engagement summary** — replace any "Instructor Performance" section. Columns: Course, Sessions, Avg Response Rate, Active Students, Open Support Cases. Pulled from the same data feeding `CourseEngagementHealthCard` / `CourseAtRiskRollup`.
5. **Trend snippet:** sessions and response-rate deltas vs prior period (sparkline as a small jsPDF line; if too complex, a 1-line "Sessions Run: 1 (+1 vs prior period)" block per metric).
6. **Student-level rows:** gated identically to the screen. For admin/dean exports, masked initials only; for advisor/IoR/support-staff exports, full rows. Same rule applies to CSV.
7. Drop the `ExportReportsCardProps.instructorPerformance` field from the typed interface and from call sites; rename existing usage to `courseEngagement`.
8. Footer keeps page numbers + Edvana branding.

## Out of scope (v1)

- Server-side audit log table for Reveal actions (TODO comment + localStorage stub only).
- Backend role enum for `support_role` (still inferred client-side from existing `user_roles` + props).
- LMS connection state detection beyond the existing `hasUsableData` heuristic.

## Technical notes

- No DB migrations.
- `viewerRole` resolution: read from `user_roles` already fetched in `AdminDashboard`; default to `admin` if the viewer has the admin role and no advisor/IoR/support role.
- Seed-name filter is a simple regex list in a `SEED_NAME_PATTERNS` const so it's easy to extend.
- All currency-of-truth metrics live in one `orgSnapshot` object passed into every card + the export.
