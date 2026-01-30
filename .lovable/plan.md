
# Fix Live Session Grading and Add Join Button to Landing Page

## Problem 1: Correct Answers Marked as Incorrect

### Root Cause Analysis

The `submit-live-response` edge function expects the correct answer at `question_content.correctAnswer`, but the data is actually stored in a nested structure:

**What's stored in `live_questions.question_content`:**
```json
{
  "type": "quiz",
  "questions": [
    {
      "question": "What is 2+2?",
      "type": "multiple_choice", 
      "options": ["A. 3", "B. 4", "C. 5", "D. 6"],
      "correctAnswer": "B"   // ← Answer is HERE
    }
  ]
}
```

**What the grading code looks for:**
```typescript
const correctAnswer = questionContent.correctAnswer || '';  // ← Looks at TOP level (empty!)
```

Since `correctAnswer` is empty, ALL answers are marked wrong.

### Solution

Update `submit-live-response` to correctly extract the answer from the nested structure:

```typescript
// Handle both formats:
// 1. Nested: { questions: [{ correctAnswer: "B" }] }  (from send-slide-question)
// 2. Direct: { correctAnswer: "B" }  (legacy format)

let correctAnswer = '';
let questionType = 'multiple_choice';

if (questionContent.questions && Array.isArray(questionContent.questions) && questionContent.questions[0]) {
  const firstQuestion = questionContent.questions[0];
  correctAnswer = firstQuestion.correctAnswer || '';
  questionType = firstQuestion.type || 'multiple_choice';
} else {
  correctAnswer = questionContent.correctAnswer || '';
  questionType = questionContent.type || 'multiple_choice';
}
```

---

## Problem 2: No "Join Live Session" on Mobile Landing Page

### Root Cause

In `Index.tsx` line 119-126, the "Join Session" button has the class `hidden sm:block`, making it invisible on mobile devices:

```tsx
<Button 
  variant="ghost" 
  size="sm" 
  onClick={() => navigate("/join")} 
  className="text-muted-foreground hover:text-foreground hidden sm:block"  // ← Hidden on mobile!
>
  Join Session
</Button>
```

### Solution

Make the button visible on all screen sizes and add a prominent mobile-friendly option in the hero section:

1. **Header button**: Change `hidden sm:block` to `block` so it's always visible
2. **Hero section**: Add a third CTA button "Join Live Session" for students without accounts

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/submit-live-response/index.ts` | Fix nested `correctAnswer` extraction from `questions[0]` |
| `src/pages/Index.tsx` | Make "Join Session" visible on all devices |

---

## Technical Details

### submit-live-response/index.ts Changes

**Lines 101-109 - Update question content parsing:**

```typescript
// Parse question content - handle both nested and direct formats
let correctAnswer = '';
let questionType = 'multiple_choice';

// Handle nested format: { questions: [{ correctAnswer, type }] }
if (questionContent.questions && Array.isArray(questionContent.questions) && questionContent.questions.length > 0) {
  const firstQuestion = questionContent.questions[0] as {
    question?: string;
    type?: string;
    correctAnswer?: string;
  };
  correctAnswer = firstQuestion.correctAnswer || '';
  questionType = firstQuestion.type || 'multiple_choice';
  console.log('📋 Using nested question format:', { correctAnswer, questionType });
} else {
  // Handle direct format: { correctAnswer, type }
  correctAnswer = (questionContent as any).correctAnswer || '';
  questionType = (questionContent as any).type || 'multiple_choice';
  console.log('📋 Using direct question format:', { correctAnswer, questionType });
}
```

### Index.tsx Changes

**Line 119-126 - Make Join Session visible on mobile:**

```tsx
<Button 
  variant="ghost" 
  size="sm" 
  onClick={() => navigate("/join")} 
  className="text-muted-foreground hover:text-foreground"  // Removed hidden sm:block
>
  Join Session
</Button>
```

---

## Expected Results After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Student selects correct MCQ answer | Marked incorrect (correctAnswer is empty) | Marked correct |
| Confidence betting rewards | Always 0 or negative XP | +10 to +30 XP for correct answers |
| Mobile user visits landing page | No way to join live session | "Join Session" button visible in header |
| Anonymous student joins via /join | Works but grading broken | Full functionality with correct grading |
