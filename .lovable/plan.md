
# Poll Mode & Live MCQ Bar Chart for Slide Presenter

## Overview

This plan adds two new features to the Slide Presenter:

1. **Poll Mode**: Send questions without grading - just collect student responses like a poll
2. **Live MCQ Bar Chart**: Display a real-time bar chart showing answer distribution as students respond

---

## Feature 1: Poll Mode

### Concept
When sending a question, the instructor can toggle "Poll Mode" which:
- Removes grading (no correct answer needed)
- Collects all responses without marking them right/wrong
- Shows only response distribution, not correctness metrics

### Changes Required

#### 1.1 Update `SlideQuestionPreviewDialog.tsx`
Add a "Poll Mode" toggle switch to the preview dialog:
- When enabled, hide the "correct answer" selection for MCQs
- Hide "expected answer" for short answers
- Add visual indicator that this is a poll (no grades)

#### 1.2 Update `SlidePresenter.tsx`
Pass `isPollMode` flag to the send-slide-question edge function

#### 1.3 Update `send-slide-question` Edge Function
- Accept new `isPollMode` boolean parameter
- When true, set `mode: 'poll'` on the assignment instead of `auto_grade` or `manual_grade`
- Store questions without `correctAnswer` field (or mark them as polls)

#### 1.4 Update `useLecturePresenterData.ts`
- Detect poll-type questions and skip correctness calculations
- Return poll-specific stats (just response counts, no correct/incorrect)

---

## Feature 2: Live MCQ Bar Chart in Overlay

### Concept
Replace the current stats display with a live-updating horizontal bar chart showing:
- Option A: ████████ 12 (40%)
- Option B: ██████████████ 15 (50%) 
- Option C: ██ 2 (7%)
- Option D: █ 1 (3%)

Updates in real-time as each student submits their answer.

### Changes Required

#### 2.1 Update `useLecturePresenterData.ts`
Add a new function to calculate MCQ option distribution:

```typescript
interface MCQDistribution {
  option: string;
  count: number;
  percentage: number;
  isCorrect?: boolean; // undefined for polls
}

const calculateMCQDistribution = (
  assignments: Assignment[], 
  question: any,
  questionIndex: number
): MCQDistribution[] => {
  // Count how many students chose each option (A, B, C, D)
  const distribution = ['A', 'B', 'C', 'D'].map(letter => {
    const count = assignments.filter(a => 
      a.completed && 
      a.quiz_responses?.[questionIndex.toString()] === letter
    ).length;
    
    const total = assignments.filter(a => a.completed).length;
    
    return {
      option: letter,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      isCorrect: question.isPoll ? undefined : letter === question.correctAnswer
    };
  });
  
  return distribution;
};
```

#### 2.2 Create New `MCQDistributionChart.tsx` Component
A compact, real-time updating bar chart designed for the overlay:

```typescript
interface MCQDistributionChartProps {
  distribution: MCQDistribution[];
  isPoll: boolean;
  totalResponses: number;
}

// Horizontal bar chart with:
// - Option labels (A, B, C, D)
// - Animated bars that grow as responses come in
// - Count and percentage labels
// - Green highlight for correct answer (if not poll mode)
```

#### 2.3 Update `SlidePresenterOverlay.tsx`
Replace the current stats grid with the MCQ bar chart when:
- There's an active MCQ question
- The question is a poll OR a graded MCQ

```typescript
// New section after "Response Stats"
{currentQuestion && isMCQ && (
  <div className="bg-slate-800/50 rounded-lg p-3">
    <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">
      {isPoll ? '📊 Poll Results' : 'Answer Distribution'}
    </div>
    <MCQDistributionChart 
      distribution={mcqDistribution}
      isPoll={currentQuestion.isPoll}
      totalResponses={currentStats.responseCount}
    />
  </div>
)}
```

---

## Technical Implementation Details

### New Files to Create
| File | Purpose |
|------|---------|
| `src/components/instructor/slides/MCQDistributionChart.tsx` | Compact bar chart for overlay |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx` | Add Poll Mode toggle |
| `src/components/instructor/slides/SlideRecordingControls.tsx` | Add "Send as Poll" quick option |
| `src/components/instructor/slides/SlidePresenterOverlay.tsx` | Add MCQ bar chart display |
| `src/pages/SlidePresenter.tsx` | Pass poll mode flag to edge function |
| `src/hooks/useLecturePresenterData.ts` | Add MCQ distribution calculation |
| `supabase/functions/send-slide-question/index.ts` | Handle poll mode assignments |

---

## Database Considerations

### Assignment Mode
Currently uses enum: `auto_grade | manual_grade`

**Option A (Recommended)**: Reuse `manual_grade` for polls since they aren't graded
- No database migration needed
- Add `isPoll: true` flag in the question content JSON

**Option B**: Add new `poll` mode to the enum
- Requires database migration
- More explicit but adds complexity

**Recommendation**: Use Option A - store `isPoll: true` in the question content and use `manual_grade` mode

---

## UI/UX Design

### Poll Mode Toggle in Preview Dialog
```
┌──────────────────────────────────────────┐
│  Preview & Edit Question     [MCQ ▼]     │
├──────────────────────────────────────────┤
│                                          │
│  [Toggle] Send as Poll                   │
│  ℹ️ Collect responses without grading    │
│                                          │
│  Question:                               │
│  [What is the capital of France?      ]  │
│                                          │
│  Answer Options:                         │
│  ○ A: [Paris         ] ← Correct (hidden │
│  ○ B: [London        ]     if poll mode) │
│  ○ C: [Berlin        ]                   │
│  ○ D: [Madrid        ]                   │
│                                          │
├──────────────────────────────────────────┤
│         [Cancel]  [Send to Students]     │
└──────────────────────────────────────────┘
```

### MCQ Bar Chart in Overlay
```
┌─────────────────────────────┐
│ 🔴 LIVE          👥 25      │
├─────────────────────────────┤
│ 📊 Answer Distribution      │
│                             │
│ A ████████████░░░  12 (48%) │
│ B ████████░░░░░░░   8 (32%) │
│ C ████░░░░░░░░░░░   4 (16%) │
│ D █░░░░░░░░░░░░░░   1 (4%)  │
│                             │
│ Total: 25/30 responded      │
└─────────────────────────────┘
```

The bars animate smoothly as responses come in, creating an engaging live visualization.

---

## Real-Time Updates

The MCQ distribution chart will update in real-time via:
1. **Supabase Realtime subscription** (already in `useLecturePresenterData.ts`)
2. **3-second polling fallback** (already implemented)

When a student submits an answer:
1. `student_assignments.quiz_responses` is updated
2. Realtime triggers `fetchData()` in the hook
3. New distribution is calculated
4. Chart animates to new values

---

## Summary

| Feature | Description |
|---------|-------------|
| **Poll Mode** | Toggle to send questions without grading |
| **MCQ Bar Chart** | Live-updating visualization of student answers |
| **Real-time Updates** | Leverages existing Realtime subscription |
| **No Database Migration** | Uses existing schema with content flags |
