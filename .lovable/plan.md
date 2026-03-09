

## Plan: Redesign Instructor Settings with Sidebar Navigation

### Current State
`InstructorSettings.tsx` renders all 7 settings components in a 2-column masonry grid inside a `max-w-4xl` container. Components: BillingSettings, QuestionFormatSettings, QuestionPreviewSettings, QuestionDifficultySettings, AdaptiveTutoringSettings (Pre-Recorded Lectures), AutoGradeSettings, LMSIntegrationSettings, KalturaSettings.

### Architecture

Replace the flat card grid with a **left sidebar + content panel** layout using URL search params (`?tab=questions`) to track the active section.

```text
┌──────────────────────────────────────────────────┐
│  Header: Instructor Settings  [Back to Dashboard]│
├────────────┬─────────────────────────────────────┤
│            │                                     │
│  Questions │   (active section content)          │
│  Pre-Rec   │                                     │
│  Grading   │   Full-width, no max-w-4xl          │
│  Integrat. │   constraint on inner content       │
│  ────────  │                                     │
│  Billing   │                                     │
│            │                                     │
└────────────┴─────────────────────────────────────┘
```

### Sections & Grouping

| Tab Key | Label | Components Rendered |
|---------|-------|-------------------|
| `questions` | Question Generation | QuestionFormatSettings + QuestionPreviewSettings + QuestionDifficultySettings — stacked vertically in one panel |
| `pre-recorded` | Pre-Recorded Lectures | AdaptiveTutoringSettings (already has preset, difficulty mix, style mix) |
| `grading` | Grading | AutoGradeSettings |
| `integrations` | Integrations | LMSIntegrationSettings + KalturaSettings — stacked vertically |
| `billing` | Plan & Billing | BillingSettings |

Default tab: `questions` (teaching-first, not billing-first).

### Changes

#### 1. Rewrite `src/pages/InstructorSettings.tsx`

- Add `activeTab` state driven by `useSearchParams` (default: `questions`)
- **Left sidebar** (fixed ~220px on desktop, horizontal tabs on mobile):
  - Nav items with icons: MessageSquare (Questions), Video (Pre-Recorded), CheckSquare (Grading), Plug (Integrations), CreditCard (Billing)
  - Active item highlighted with `bg-accent text-accent-foreground`
  - Billing separated with a visual divider (it's account, not teaching)
- **Right content area**: `max-w-3xl` panel rendering the grouped components for the active tab
- On mobile: sidebar collapses to horizontal scrollable tab bar at top
- Keep existing auth check logic unchanged
- Remove the `max-w-4xl` 2-column grid layout

#### 2. Minor component tweaks (no logic changes)

- Remove `col-span-full` from BillingSettings' outer Card (it was needed for the grid, won't matter in the new layout)
- No changes to any settings component internals — they already have their own cards, headers, and save buttons

### Files to Edit
- `src/pages/InstructorSettings.tsx` — Full layout rewrite (sidebar nav + content panel + search param routing)

No new files needed. No backend changes. All existing settings components used as-is.

