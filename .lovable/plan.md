## Goal
Make the admin Overview tab a clean, read-only health snapshot a dean can scan in seconds. Move org configuration off Overview, lead with participation (not grades), and replace `0 / 0%` with real empty states when no data source is connected.

## 1. Structural moves

`src/pages/AdminDashboard.tsx`
- Remove `<OrganizationSetup />` from the `overview` tab body.
- In the `settings` tab, render (in order):
  1. The org-creation form (when no org exists) — extract from `OrganizationSetup` or render the existing component, which already gates on "no org" with the create card.
  2. `OrganizationSetup` (Auto-Join Domains + Invite Instructors + rename).
  3. `LMSIntegrationSettings` (already there).
- Overview tab new top-to-bottom order:
  1. Governance chip row (see §2)
  2. Quick views (Smart Preset chips) — read-only filtering of the snapshot
  3. 3 KPI cards (re-anchored, see §3)
  4. Usage Over Time (with new empty state, §4)
  5. Learning Insights (strengthened, §5)
  6. Export Reports (relabeled, §6)

Overview must remain 100% aggregate. No named-student rows. (`AtRiskStudentsTable` stays on Support tab.)

## 2. Governance chip row

New small component (e.g. `src/components/admin/GovernanceChips.tsx`) rendered at top of Overview:
- Pills: "Aggregate only", "Formative", "Not faculty evaluation", "Role-scoped".
- Muted background, `Shield` icon prefix on the row.
- Footer disclaimer stays as-is.

## 3. KPI cards — re-anchor to participation

Rewrite `AggregateMetricsCard.tsx` (or replace with `ParticipationSnapshotCards.tsx`) to render a hero + 2-up layout:

- **Hero (large, full-width on md, 2-col span):** Student Response Rate, with week-over-week delta arrow (▲ / ▼ + pp).
- **Card 2:** Active Students (last 7 days) + WoW delta.
- **Card 3:** Sessions Run (period) + "avg X checks/session" subtitle.

Drop "Avg Grade" — never surface here.

Data work in `useAdminDashboardData.ts`:
- Add `activeStudents7d` and `previousPeriod` versions of responseRate / activeStudents / sessionsUsed so we can compute deltas.
- Reuse existing query patterns; query the prior equal-length window in parallel.

## 4. Empty-state rule (critical)

Add a single source of truth: `hasAnyData = sessionsUsed > 0 || weeklyUsage.some(...)`.

- **Unconnected / no data ever:** Each KPI card and the Usage chart show an empty state with copy "No session data yet. Connect your LMS to populate this." + a "Connect LMS" button that routes to `?tab=settings`. Do NOT render `0` or `0.0%`.
- **Connected but zero this period:** Show `0` with caption "No activity in this period." (subtle, muted).

We detect "connected" via presence of any historical session for the admin's instructors (any time, not just filter window). If zero historical sessions → treat as unconnected.

## 5. Learning Insights — actionable

Update `LearningInsightsCard.tsx`:
- Each Misconception/Confidence row shows: concept text, student count, course name (aggregate), and a suggested action line ("Share with [Course] instructor team").
- Recommended Actions: tie each rec to a specific course/topic from the data, not generic copy. When no signals: empty state "No misconceptions detected this period."
- Keep all language course-level. No instructor names.

Requires pulling `course_id` → course name map into `useAdminDashboardData` and attaching `courseName` to `MisconceptionItem` / `ConfidenceIssue`.

## 6. Export Reports — relabel + scope

`src/components/admin/ExportReportsCard.tsx`:
- Rename "Instructor performance data" → "Course-level engagement summary".
- Keep "At-risk student identification" line but add a small note: "Student-level rows only included for roles with documented legitimate interest (FERPA)." Gate the per-student CSV section behind an existing role check; chairs get aggregate-only export.
- Keep enrollment/activity and completion-rate items.

## 7. Quick views

Keep current Smart Preset chips. Rename `confident-misconceptions` preset label to "Confident but wrong" in `src/lib/adminSmartPresets.ts` (label only; id/refinement unchanged) and re-add it to the Overview-visible set since Overview will now show the smart preset row.

Render `<SmartPresetChips />` on Overview (not the full `AdminFilterBar` — that stays Adoption-only).

## Files to touch

- `src/pages/AdminDashboard.tsx` — reorder Overview, move OrgSetup to Settings, add governance chips + preset chips on Overview.
- `src/components/admin/OrganizationSetup.tsx` — no logic change; just rendered from Settings now.
- `src/components/admin/AggregateMetricsCard.tsx` — restructure to hero + 2; add deltas + empty states.
- `src/components/admin/UsageOverTimeChart.tsx` — replace blank-chart fallback with connect-prompt when `!hasAnyData`.
- `src/components/admin/LearningInsightsCard.tsx` — add course tag + suggested action per row.
- `src/components/admin/ExportReportsCard.tsx` — relabel + FERPA note + role gate.
- `src/hooks/useAdminDashboardData.ts` — add prior-period metrics, activeStudents7d, course name map, `hasAnyData` flag.
- `src/lib/adminSmartPresets.ts` — rename label.
- New `src/components/admin/GovernanceChips.tsx`.

## Out of scope
- No backend/schema changes. No new edge functions. Drill-down behavior on Support tab unchanged.
