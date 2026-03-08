

## Question Bank Redesign Plan

### Current State
`QuestionBankTab.tsx` (~389 lines) renders a single card with search/filters, manual questions, collapsible source material groups, and a disconnected `QuestionBankResults` component at the bottom. Questions within source groups are sorted by `created_at DESC` (last slide first). The layout uses a narrow single-column structure with no prep/live mode distinction, no question lifecycle, and no inline preview.

### Files to Create/Edit

#### 1. Edit: `src/components/instructor/QuestionBankTab.tsx` (full rewrite)
Replace the single-card layout with a two-column responsive layout and tabbed modes.

**Top Control Bar** (full width):
- Upload Slides button, New Question button, Search input, Type filter dropdown
- Summary stats row: `{total} questions · {ready} ready · {pushed} pushed` (computed from `times_used` field)

**Mode Tabs** (Prep / Live Push):
- **Prep Mode**: Full question list with edit/delete/approve actions, source grouping, expandable inline preview
- **Live Push Mode**: Streamlined view — questions sorted by source slide order, larger push buttons, pushed/unpushed status visible, recently pushed results inline

**Layout** (both modes):
- Left column (2/3): question list
- Right column (1/3): detail/preview panel showing selected question's full text, answer choices, correct answer, source reference, push button, edit link, and push history/results if available

**Sorting fix**: Within source groups, sort questions by `title` (which contains slide numbers like "Slide 1 Question", "Slide 2 Question") using natural sort, ascending. This fixes last-to-first ordering.

**Question lifecycle**: Add visual status badges computed from existing data:
- "Ready" (default — `times_used === 0` or null)
- "Pushed" (`times_used > 0`)
- Show `times_used` count and `last_used_at` on each card

#### 2. Edit: `src/components/instructor/question-bank/QuestionBankCard.tsx`
Redesign the card for better scannability:
- Wider layout with question text more prominent (not truncated to 120 chars — show ~200 in prep, full in live)
- Add status badge (Ready / Pushed) based on `times_used`
- Show source slide reference inline
- In Live Push mode: larger Push button, de-emphasize edit/delete
- Make the card clickable to select it (populates preview panel)
- Add `selected` and `mode` props

#### 3. Edit: `src/components/instructor/question-bank/SourceMaterialCard.tsx`
- Sort questions within each group by title ascending (natural sort) instead of default `created_at` desc
- In Live Push mode: auto-expand all groups, hide delete-all button, show sequential numbering
- Add question count stats: "3 ready · 1 pushed"

#### 4. Remove `QuestionBankResults` as standalone bottom section
Instead, integrate results into the question bank:
- In the right preview panel: when a pushed question is selected, show its response stats (submitted count, avg grade) inline
- In Live Push mode: add a "Recently Pushed" section at the top showing the last 3 pushed questions with response counts
- Reuse the data-fetching logic from `QuestionBankResults` but render it contextually

#### 5. No database changes needed
All lifecycle data (`times_used`, `last_used_at`) already exists on `instructor_question_bank`. Status is computed client-side.

### Technical Details
- Mode state (`prep` | `live`) stored in local component state via Tabs
- Selected question state for preview panel: `selectedQuestionId`
- Right panel uses existing Card components, conditionally renders results data
- Results data fetched with existing `QuestionBankResults` query logic (filtered to selected question's `questionBankId`)
- Natural sort for slide ordering: extract number from title with regex `/Slide\s*(\d+)/i`
- All existing dialog components (CreateQuestionDialog, PushQuestionDialog, AlertDialogs) remain unchanged
- `SlideUploadFlow` still renders as a full-page overlay when triggered

