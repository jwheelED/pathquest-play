# Rebuild Support Workflow Tab

Reframe from "risk-ranking watchlist" to "support routing queue" — behavioral signals only, fully explainable, role-gated, with status workflow and proper empty states.

## Files to touch

- `src/pages/AdminDashboard.tsx` — data aggregation (drop grade-driven risk scoring, add behavioral signals + course aggregates), role gating, empty-state handling.
- `src/components/admin/RetentionHealthCard.tsx` — re-anchor on behavioral signals; empty state when no LMS / no sessions; remove broken 100%/0% mix.
- `src/components/admin/AtRiskStudentsTable.tsx` → replaced by new `SupportQueueTable.tsx` (kept file as legacy/unused). New table shows why + action + owner/status.
- `src/components/admin/GovernanceBanner.tsx` (new) — visible no-demographics + behavioral-signals guarantee banner shown at top of Support tab.
- `src/components/admin/CourseAtRiskRollup.tsx` (new) — course-level "N students need support in Biology" rollup shown to non-privileged admin roles.
- DB migration: new `student_support_cases` table for status workflow (Open / Contacted / Resolved + owner + notes).

## Governance + role gating

Roles allowed to see **named student rows**: `advisor`, `instructor`, `support_staff` (legitimate interest). All other admin roles (`dean`, `chair`, generic `admin` without scoped role) see only the **course-level rollup** with counts, never names.

Implementation:
- Add `support_role` column to `profiles` (nullable enum: `advisor | instructor_of_record | support_staff`), set by org admin.
- Gate logic in `AdminDashboard.tsx`: `canViewIndividuals = hasSupportRole || isInstructorOfRecord`. Otherwise render `CourseAtRiskRollup` only.
- Banner explicitly states: "Individual student records are limited to staff with documented legitimate educational interest (FERPA §99.31)."

## Behavioral-only risk model

Remove grade-as-primary. New signals (each visible, each weighted, no demographics):

| Signal | Threshold | Weight |
|---|---|---|
| Response-rate drop (last 7d vs prior 7d) | ≥30% drop | 3 |
| Response-rate drop | ≥10% drop | 1 |
| Inactive | ≥9 days | 3 |
| Inactive | ≥4 days | 1 |
| Missed last N consecutive sessions | ≥3 | 2 |
| Submission-rate (live response participation) | <40% over 14d | 2 |
| Streak broken (was ≥3, now 0) | — | 1 |

Tiers: Critical ≥6, High ≥4, Medium ≥2. Grades are NOT in the score. Grades from LMS show as **context-only** in the drilldown, never weighted, never sortable column.

Every row displays the exact signals + thresholds that produced its tier — no chips collapsed under "+2 more." Tooltip on tier badge: "How this is computed →" opens score breakdown.

## Retention Health cards (fix broken read)

Current bug: Pass Rate 100% + 7-Day Active 0% + Completion 0% appears at once.

Rules:
1. If `instructorIds.length === 0` OR no sessions in last 28d → render single empty-state card: "Connect your LMS to populate retention metrics" + Connect button. No metric tiles.
2. Otherwise render 4 cards, hero = **7-Day Active Response Rate** (behavioral), then Inactive-≥7d Count, Sessions/Student, At-Risk Count. Pass Rate moved to a secondary "LMS Context" strip, clearly labeled "from Canvas," only if LMS grades exist.
3. Any metric whose denominator is 0 renders "—" with tooltip "Not enough data yet," never `0.0%` or `100%`.

## Support Queue table (replaces AtRiskStudentsTable)

Columns:
- **Student** (gated)
- **Why flagged** — full plain-text reason, e.g. "Response rate 78%→31% over 3 sessions; inactive 9 days"
- **Suggested action** — templated: `Send check-in`, `Refer to advising`, `Flag to instructor` (chosen by dominant signal)
- **Owner** — assignable from staff in the org with support roles
- **Status** — `Open | Contacted | Resolved` (default Open), changeable inline, persisted in `student_support_cases`
- **Tier** — Critical/High/Medium with "why" tooltip

Sort default: tier desc, then days-since-active desc. Status defaults filter to `Open`. Resolved auto-archives after 14d.

No "Avg Grade" column. No risk-score numeric column (tier label only).

## Empty / seed-data hygiene

- Filter out rows where `instructorName === 'Unknown'`, `lastActivityDate` null, OR student has fewer than 3 lifetime responses (insufficient signal). These never appear as Critical.
- If filtered list is empty post-cleanup, show: "No students currently need support — when behavioral signals dip we'll surface them here."

## New table (migration)

```sql
CREATE TABLE public.student_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  tier text NOT NULL CHECK (tier IN ('critical','high','medium')),
  signals jsonb NOT NULL,
  suggested_action text,
  owner_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','contacted','resolved')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.student_support_cases TO authenticated;
GRANT ALL ON public.student_support_cases TO service_role;
ALTER TABLE public.student_support_cases ENABLE ROW LEVEL SECURITY;
-- Policy: only users with support_role in same org_id may select/update.
```
Plus `support_role` column on `profiles`.

## Governance banner (top of tab)

Two lines, always visible:
1. "Risk flags use behavioral signals only — participation, response rate, activity. No race, gender, age, or any demographic variable is used."
2. "Individual student records limited to staff with documented legitimate educational interest (FERPA §99.31)."

Plus existing footer chips kept.

## Out of scope (v1)

- Canvas grade ingestion as a context column (stub the LMS Context strip; populate when LMS sync lands).
- Audit log of who viewed which student row (recommended v2 for FERPA defensibility).
- Bulk actions on queue rows.
- Removing `AtRiskStudentsTable.tsx` file (left unused, can prune later).
