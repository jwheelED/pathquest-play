
# Make Poll Mode the Default (No Toggle)

## Overview

This change removes the Poll Mode toggle and makes poll mode the **default and only behavior** for the Slide Presenter. Instructors will no longer have the option to send graded questions - all questions from Slide Presenter will be polls.

---

## Changes Required

### File 1: `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx`

**Changes:**
1. Remove the `isPollMode` state variable and always treat it as `true`
2. Remove the Poll Mode toggle UI section entirely
3. Simplify the MCQ editor to never show the "correct answer" radio buttons
4. Simplify the Short Answer editor to never show "expected answer" fields
5. Always pass `isPollMode: true` in `handleConfirm`

**Before (lines 69-70):**
```typescript
// Poll mode state
const [isPollMode, setIsPollMode] = useState(false);
```

**After:**
```typescript
// Poll mode is always enabled - no grading for slide presenter
const isPollMode = true;
```

**Remove entire section (lines 194-214):**
The Poll Mode toggle UI block will be removed completely.

**MCQ Editor simplification (lines 232-275):**
- Remove the conditional `{isPollMode ? (...) : (...)}` 
- Keep only the poll mode UI (simple inputs without RadioGroup for correct answer)

**Short Answer simplification (lines 312-344):**
- Remove the conditional `{!isPollMode && (...)}` blocks
- Always show the poll mode info banner

**handleConfirm simplification (lines 124-156):**
- Always set `correct_answer: ''` for MCQ
- Always set `expected_answer: ''` for Short Answer  
- Always set `isPoll: true` on the data

---

## Summary of Removals

| Item | Action |
|------|--------|
| `isPollMode` state | Replace with constant `true` |
| Poll Mode toggle switch | Remove entirely |
| Correct answer RadioGroup (MCQ) | Remove, keep simple inputs |
| Expected answer fields (Short Answer) | Remove |
| Explanation fields | Remove (only used for grading) |
| "Select the radio button..." helper text | Remove |

---

## Simplified UI After Changes

### MCQ Preview Dialog:
```
┌──────────────────────────────────────────┐
│  Preview & Edit Question     [MCQ]       │
├──────────────────────────────────────────┤
│                                          │
│  📊 Responses will be collected as poll  │
│                                          │
│  Question:                               │
│  [What is the capital of France?      ]  │
│                                          │
│  Answer Options:                         │
│  A: [Paris              ]                │
│  B: [London             ]                │
│  C: [Berlin             ]                │
│  D: [Madrid             ]                │
│                                          │
├──────────────────────────────────────────┤
│         [Cancel]  [Send to Students]     │
└──────────────────────────────────────────┘
```

### Short Answer Preview Dialog:
```
┌──────────────────────────────────────────┐
│  Preview & Edit Question  [Short Answer] │
├──────────────────────────────────────────┤
│                                          │
│  📊 Poll mode: Student responses will    │
│     be collected without grading.        │
│                                          │
│  Question:                               │
│  [Explain the concept of...           ]  │
│                                          │
├──────────────────────────────────────────┤
│         [Cancel]  [Send to Students]     │
└──────────────────────────────────────────┘
```

---

## Impact

- **No database changes needed** - already uses `isPoll: true` flag
- **Live MCQ Bar Chart continues to work** - unaffected by this change
- **Edge function unchanged** - still receives `isPollMode: true`
- **Cleaner UI** - fewer options for instructors to consider

---

## Files to Modify

| File | Changes |
|------|--------|
| `src/components/instructor/slides/SlideQuestionPreviewDialog.tsx` | Remove toggle, hardcode poll mode |

The `SlidePresenter.tsx` file requires no changes since it already passes `isPollMode` to the edge function from the dialog's callback.
