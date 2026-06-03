## Goal

Give admins a powerful, intuitive way to slice their dashboard data — by instructor, course, session, time, and engagement — with both a global filter bar and per-card refinements, plus savable presets and out-of-the-box "smart presets" curated for common admin questions.

## Filter dimensions (phase 1)

**Global (apply to every card)**
- Instructor — multi-select (org's instructors)
- Course — multi-select (auto-scoped to selected instructors)
- Session type — Live / Pre-recorded / Scheduled Event
- Date range — 7d / 30d / This term / Custom (default 30d)

**Per-card refinements**
- *At-Risk Students table*: risk level, activity status (active / inactive 7d+), grade band, student name/email search
- *Misconceptions card*: min responses threshold, correct-rate ceiling
- *Confidence Issues card*: min confidently-wrong count
- *Usage Over Time chart*: granularity (day/week), metric toggle (sessions vs questions)
- *Instructor Performance*: sort by sessions / response rate / avg grade

## Smart presets (built-in)

Pre-built filter combos surfaced as one-click chips above the global bar:

1. **At-risk this week** — last 7d, risk level = high/critical
2. **Underperforming sessions** — last 30d, correct rate <50%, ≥10 responses
3. **Inactive students** — no activity 7d+, enrolled in any course
4. **Top struggling courses** — courses with lowest avg grade, last 30d
5. **High-confidence misconceptions** — confidently-wrong ≥3, last 30d
6. **Low engagement instructors** — response rate <50%, last 30d
7. **New this term** — sessions created in current term

## Custom saved presets

- Admin can save current filter state with a name + optional emoji/color
- Presets appear in a "My views" dropdown next to smart presets
- Stored per-admin (not org-wide) so each admin curates their own
- Edit/rename/delete from a manage modal

## UI layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Smart presets: [At-risk week] [Underperforming] [Inactive]…│
│ My views:      [▼ Select preset] [+ Save current]          │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Instructor ▼] [Course ▼] [Type ▼] [Date ▼] [Clear]│ ← sticky
├─────────────────────────────────────────────────────────────┤
│ Active filter chips: × Prof. Smith  × BIO 101  × Last 7d   │
└─────────────────────────────────────────────────────────────┘
   ↓ filtered cards below
```

Each card keeps its existing local controls (search, sort) and adds 1–2 refinement filters specific to its data.

## Technical implementation

**Data layer**
- New hook `useAdminFilters()` — central filter state, URL-synced (`?instructor=...&course=...&from=...&to=...&preset=...`)
- Refactor `useAdminDashboardData(instructorIds)` → `useAdminDashboardData(filters)` to accept the full filter object; push `instructor_id IN`, `course_id IN`, date range, and session type into Supabase queries
- Add `course_id` join through `live_sessions` (already exists)
- Multi-select dropdowns use shadcn `Command` + `Popover` (combobox pattern)

**Saved presets**
- New table `admin_dashboard_presets` (admin_id, name, filters jsonb, icon, created_at)
- RLS: admin can CRUD their own rows
- GRANTs for authenticated + service_role

**Smart presets** — hardcoded array in `src/lib/adminSmartPresets.ts`, each is a `{ id, label, icon, filters }` object that hydrates `useAdminFilters`

**New components**
- `src/components/admin/AdminFilterBar.tsx` — sticky bar, multi-selects, date picker, active chips
- `src/components/admin/SmartPresetChips.tsx` — horizontal scrollable preset row
- `src/components/admin/SavedPresetsMenu.tsx` — dropdown + save/manage modal
- `src/hooks/useAdminFilters.ts` — state + URL sync

**Refactored**
- `src/pages/AdminDashboard.tsx` — wire filter bar, pass filters to data hook, pass card-specific subsets to each card
- `src/hooks/useAdminDashboardData.ts` — accept filters, scope queries
- `src/components/admin/AtRiskStudentsTable.tsx` — accept external filters, drop the duplicated risk pill filter when global one is active
- All admin cards — accept filtered data as props (already do)

## Out of scope (future phases)

- Performance bands, integrity/LMS filters, seat usage filters → phase 2
- Org-wide shared presets → phase 2
- Filter analytics ("most-used preset") → phase 3
