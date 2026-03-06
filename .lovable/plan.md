

## Plan: Overview Page Visual & UX Fixes

### 1. Change global background from baby blue to neutral grey

**File: `src/index.css`** (line 13)

Change `--background: 200 60% 94%` to `--background: 210 20% 98%` (equivalent to ~#F9FAFB in HSL). This instantly fixes the washout and contrast issues site-wide.

### 2. Restructure MetricCard layout — label on top, value below, remove truncated trend text

**File: `src/components/dashboard/MetricCard.tsx`**

- Flip the card layout: put **label** at top (font-medium, text-sm), **value** below it (large bold number)
- Move the icon to sit inline with the label row
- Remove the trend text from the top-right corner entirely (this is where "Participation + r..." truncates). Keep only the trend arrow icon if a trend exists
- Add a small `description` prop for optional subtitle text below the value (not truncated — use `text-wrap` or `line-clamp-2` instead of `truncate`)

### 3. Remove "Start Live Session" from Quick Actions card

**File: `src/components/instructor/InstructorQuickActions.tsx`**

- Delete the "Start Live Session" button (it already exists in the top nav header)
- Keep only "Create Question" and "Upload Slides"
- Restyle both buttons: `bg-white border border-gray-200 hover:bg-gray-50 text-foreground` with green icon color (`text-primary`) to make them look clickable, not disabled

### 4. Fix Quick Action & CourseCodeCard button styling for affordance

**File: `src/components/instructor/CourseCodeCard.tsx`**

- Ensure the "Copy Join Code" button has a visible `border border-border` and clear hover state so it doesn't look like a disabled input

### 5. Update InstructorOverview KPI cards to use new MetricCard layout

**File: `src/components/instructor/InstructorOverview.tsx`**

- Update the `trend` props to remove long text strings (e.g., "Participation + responses") — instead pass these as the new `description` prop
- For Assignment Completion card: ensure subtitle text ("X of Y students") is not truncated

### 6. Standardize button border-radius

**File: `src/pages/InstructorDashboard.tsx`** — top nav buttons

- Change any `rounded-full` pill buttons in the header (Start Live, Present Slides) to `rounded-lg` to match the rest of the app

### Summary of changes

| File | Change |
|------|--------|
| `src/index.css` | Background color → neutral off-white |
| `src/components/dashboard/MetricCard.tsx` | Label-on-top layout, add `description` prop, remove truncated trend text |
| `src/components/instructor/InstructorQuickActions.tsx` | Remove "Start Live", restyle buttons with borders |
| `src/components/instructor/CourseCodeCard.tsx` | Ensure button has visible border |
| `src/components/instructor/InstructorOverview.tsx` | Update MetricCard props for new layout |
| `src/pages/InstructorDashboard.tsx` | Standardize header button radii to `rounded-lg` |

