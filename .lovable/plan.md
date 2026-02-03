
# Question Bank (Question Studio) Feature Plan

## Overview
This plan creates a comprehensive **Question Bank** feature that allows instructors to create, save, and push questions to students on-demand. The system will be differentiated by professor type:

- **STEM/Medical Instructors**: Access to MCQ, Short Answer, and Coding questions
- **Humanities Instructors**: Access to MCQ and Short Answer only (no coding)

## Current State Analysis

### Existing Infrastructure
1. **Database Table**: `instructor_question_bank` already exists with:
   - `id`, `instructor_id`, `course_id`, `title`, `question_type`
   - `question_content` (JSONB), `tags`, `difficulty`, `times_used`, `last_used_at`

2. **Question Delivery**: `format-and-send-question` edge function handles reliable delivery via:
   - Batch processing with parallel inserts
   - Retry logic for failed deliveries
   - Realtime subscription + polling fallback on student side

3. **Student Reception**: `AssignedContent.tsx` has robust realtime subscriptions with:
   - Server-side filtering
   - Exponential backoff retry
   - Polling fallback (3s when disconnected, 30s for resilience)
   - Audio notifications + toast alerts

4. **Professor Type Differentiation**: `professor_type` enum (`stem`, `humanities`, `medical`) already used throughout the app

### Gap Analysis
- No UI exists for the `instructor_question_bank` table
- No "push to students" functionality from the bank
- Existing `QuestionStudio.tsx` is focused on lecture calibration, not a question bank

---

## Implementation Summary

### New Components
1. **QuestionBankPage.tsx** - Full-page question bank management
2. **QuestionBankCard.tsx** - Individual question card with edit/delete/push actions
3. **CreateQuestionDialog.tsx** - Dialog for creating new questions (MCQ/Short Answer/Coding)
4. **PushQuestionDialog.tsx** - Confirmation dialog for pushing to students

### New Edge Function
1. **push-bank-question** - Handles reliable delivery of bank questions to students

### Database Additions
- None required (using existing `instructor_question_bank` table)

---

## Detailed Technical Design

### 1. Question Bank Page (`src/pages/QuestionBankPage.tsx`)

Main instructor interface for managing saved questions.

**Features:**
- List all questions with search/filter by type, tags, difficulty
- Create new question button
- Each question shows: title, type badge, difficulty, times used
- Actions per question: Edit, Delete, Push to Students

**Professor Type Differentiation:**
```typescript
// Filter available question types based on professor type
const getAvailableTypes = (professorType: string | null) => {
  const baseTypes = ['multiple_choice', 'short_answer'];
  if (professorType !== 'humanities') {
    return [...baseTypes, 'coding'];
  }
  return baseTypes;
};
```

### 2. Create Question Dialog (`src/components/instructor/CreateQuestionDialog.tsx`)

Modal for creating new questions with fields:

**Common Fields:**
- `title` - Required, descriptive name for the question
- `question_type` - MCQ, Short Answer, or Coding (STEM/Medical only)
- `difficulty` - easy, medium, hard
- `tags` - Optional array of tags for organization

**MCQ-Specific Fields:**
- `question_text` - The question prompt
- `options` - Array of 4 options (A, B, C, D)
- `correct_answer` - The correct option letter
- `explanation` - Why this answer is correct

**Short Answer Fields:**
- `question_text` - The question prompt
- `expected_answer` - Model answer for grading reference

**Coding Fields (STEM/Medical only):**
- `problem_text` - Problem description
- `starter_code` - Initial code template
- `expected_solution` - Model solution
- `language` - Programming language (from instructor preferences)

### 3. Push Question Flow

**PushQuestionDialog.tsx:**
```typescript
interface PushQuestionDialogProps {
  question: BankQuestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}
```

Shows:
- Question preview
- Target course selection (from `useCourseContext`)
- "Push Now" button with loading state
- Success confirmation with student count

**Reliability Guarantees:**
- Uses existing `format-and-send-question` pattern
- Batch processing for 25+ students
- Retry logic for failed deliveries
- Updates `times_used` and `last_used_at` on success

### 4. Edge Function: `push-bank-question`

```typescript
// supabase/functions/push-bank-question/index.ts

// Request body:
interface PushBankQuestionRequest {
  questionId: string;
  courseId: string;
}

// Process:
// 1. Fetch question from instructor_question_bank
// 2. Verify instructor owns the question
// 3. Get all students in the course
// 4. Create student_assignments with:
//    - assignment_type: "lecture_checkin"
//    - mode: auto_grade (MCQ/coding_simple) or manual_grade
//    - title: question.title
//    - content: { questions: [formattedQuestion], source: "question_bank" }
// 5. Update question's times_used and last_used_at
// 6. Return success with student count
```

### 5. Student-Side Reception

No changes needed! The existing `AssignedContent.tsx` already handles:
- Realtime subscription for new `student_assignments`
- Audio notification when new question arrives
- Auto-expand first live check-in
- All question types (MCQ, Short Answer, Coding)

---

## Navigation Integration

Add "Question Bank" to instructor dashboard navigation:

```typescript
// In InstructorDashboard.tsx navItems array
{
  value: "question-bank",
  label: "Question Bank",
  icon: Library, // or BookMarked
}
```

---

## Question Content Schema

The `question_content` JSONB field will store:

```typescript
// MCQ
{
  type: "multiple_choice",
  question: string,
  options: string[], // ["A. ...", "B. ...", "C. ...", "D. ..."]
  correctAnswer: string, // "A" | "B" | "C" | "D"
  explanation?: string
}

// Short Answer
{
  type: "short_answer",
  question: string,
  expectedAnswer?: string
}

// Coding
{
  type: "coding" | "coding_simple",
  problemText: string,
  starterCode?: string,
  expectedSolution?: string,
  language: string,
  difficulty: string
}
```

---

## Files to Create

| File | Description |
|------|-------------|
| `src/pages/QuestionBankPage.tsx` | Main question bank management page |
| `src/components/instructor/question-bank/QuestionBankCard.tsx` | Individual question card component |
| `src/components/instructor/question-bank/CreateQuestionDialog.tsx` | Create/edit question modal |
| `src/components/instructor/question-bank/PushQuestionDialog.tsx` | Confirm push to students modal |
| `src/components/instructor/question-bank/index.ts` | Barrel exports |
| `supabase/functions/push-bank-question/index.ts` | Edge function for pushing questions |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/InstructorDashboard.tsx` | Add Question Bank tab to navigation |
| `src/App.tsx` | Add route for `/instructor/question-bank` |
| `supabase/config.toml` | Add push-bank-question function config |

---

## Reliability Considerations

### Question Delivery Reliability
1. **Batch Processing**: Process students in batches of 25 for parallel delivery
2. **Retry Logic**: Failed batches retry once automatically
3. **Idempotency**: Include idempotency key to prevent duplicates
4. **Logging**: Comprehensive logging for debugging

### Student Reception Reliability
Already implemented in `AssignedContent.tsx`:
1. **Realtime Subscription**: Server-side filtered subscription
2. **Polling Fallback**: 3-second polling when realtime disconnected
3. **Visibility Handler**: Fetch on tab visibility change
4. **Exponential Backoff**: For reconnection attempts (up to 5 retries)
5. **Long Lecture Resilience**: 30-second periodic fetch

---

## UI/UX Design

### Question Bank Page Layout
```text
+------------------------------------------+
| Question Bank                    [+ New] |
+------------------------------------------+
| Search: [____________]  Filter: [Type ▼] |
+------------------------------------------+
| ┌──────────────────────────────────────┐ |
| │ [MCQ] Calculate derivative...        │ |
| │ ⭐ medium  📊 Used 5 times           │ |
| │ [Edit] [Delete] [Push to Students]   │ |
| └──────────────────────────────────────┘ |
| ┌──────────────────────────────────────┐ |
| │ [Short] Explain cellular respiration │ |
| │ ⭐ easy   📊 Used 3 times            │ |
| │ [Edit] [Delete] [Push to Students]   │ |
| └──────────────────────────────────────┘ |
+------------------------------------------+
```

### Create Question Dialog
```text
+-------------------------------------+
| Create New Question                 |
+-------------------------------------+
| Title: [Derivative of x²]          |
|                                     |
| Type: ( ) MCQ  ( ) Short  ( ) Code |
|                                     |
| Difficulty: [Medium ▼]             |
|                                     |
| [Question-type-specific fields]    |
|                                     |
| Tags: [calculus] [derivatives] [+] |
|                                     |
|              [Cancel] [Save]        |
+-------------------------------------+
```

---

## Implementation Order

1. **Phase 1**: Create Question Bank page with list view and create dialog
2. **Phase 2**: Add edit/delete functionality
3. **Phase 3**: Create `push-bank-question` edge function
4. **Phase 4**: Add Push to Students dialog with course selection
5. **Phase 5**: Add to dashboard navigation and routing
6. **Phase 6**: Testing and refinement
