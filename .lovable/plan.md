

# Auto-Generate Questions in Preview Dialog

## Current Problem

The question preview dialog currently has auto-generation code that **doesn't work** due to two issues:

1. **Missing Edge Functions**: The component calls two Edge Functions that don't exist:
   - `generate-mcq-options`
   - `generate-expected-answer`

2. **Trigger Timing**: The auto-generation only triggers when the question **type changes**, not when the dialog first opens

---

## Solution

### Part 1: Create Missing Edge Functions

#### File: `supabase/functions/generate-mcq-options/index.ts`

This function takes a question text and generates 4 MCQ options with a correct answer.

```typescript
// Uses Gemini 2.5 Flash to generate:
// - 4 answer options (A, B, C, D)
// - The correct answer letter
// - An explanation (optional)
```

#### File: `supabase/functions/generate-expected-answer/index.ts`

This function takes a short answer question and generates an expected/ideal answer for grading reference.

```typescript
// Uses Gemini 2.5 Flash to generate:
// - A concise expected answer
// - Used as grading reference for auto-grading
```

---

### Part 2: Fix Auto-Generation Triggers

**File: `src/components/instructor/VoiceQuestionPreviewDialog.tsx`**

Update the `useEffect` hooks to trigger on dialog open, not just on type change:

**Current (lines 89-101):**
```typescript
useEffect(() => {
  // ... auto-generate MCQ options
}, [questionType]);  // Only triggers on type change
```

**Updated:**
```typescript
useEffect(() => {
  // ... auto-generate MCQ options
}, [questionType, open, questionText]);  // Also triggers on dialog open
```

Same change for the expected answer generation (lines 104-114).

---

## Technical Details

### Edge Function: `generate-mcq-options`

```text
Input: { question_text: "What is 2 + 2?" }

Output: {
  options: ["3", "4", "5", "6"],
  correct_answer: "B",
  explanation: "2 + 2 equals 4"
}
```

Uses tool calling to ensure structured JSON output.

### Edge Function: `generate-expected-answer`

```text
Input: { question_text: "Explain photosynthesis" }

Output: {
  expected_answer: "Photosynthesis is the process by which plants convert sunlight, carbon dioxide, and water into glucose and oxygen."
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/generate-mcq-options/index.ts` | Generate 4 MCQ options + correct answer |
| `supabase/functions/generate-expected-answer/index.ts` | Generate expected answer for short answer questions |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructor/VoiceQuestionPreviewDialog.tsx` | Update useEffect dependencies to trigger on dialog open |
| `supabase/config.toml` | Add new functions with `verify_jwt = false` |

---

## User Experience After Fix

1. Instructor triggers voice question or clicks "Send Question"
2. Preview dialog opens with extracted question
3. **Automatically** generates:
   - MCQ options (if type is multiple choice)
   - Expected answer (if type is short answer)
4. Instructor can edit or regenerate before sending
5. No manual "Generate" button click required

---

## CORS Headers

Both new Edge Functions will include the updated CORS headers with `x-supabase-client-platform` to prevent the connectivity issues you experienced.

