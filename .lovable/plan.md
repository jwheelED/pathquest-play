
# STEM Question Bank Feature Plan

## Overview

This plan adds a dedicated **Question Bank** for STEM instructors to pre-create programming problems, MCQs, and short-answer questions before class. These saved questions can then be quickly deployed to students during live sessions with a single click.

---

## Feature Summary

### What You'll Get
1. **Question Bank Library** - A searchable, filterable library of pre-created questions stored per-course
2. **Question Creator** - Full-featured editor supporting:
   - **Coding problems** (with starter code, test cases, examples, constraints)
   - **MCQs** (with options, correct answer, explanation)
   - **Short-answer questions** (with expected answer for auto-grading)
3. **Quick Deploy Panel** - During live sessions, a panel showing saved questions that can be sent with one click
4. **Tag & Search System** - Organize questions by topic, difficulty, and custom tags

---

## User Experience Flow

```text
Before Class:
┌─────────────────────────────────────────────────────────────┐
│  Question Bank (New Tab on Dashboard)                       │
├─────────────────────────────────────────────────────────────┤
│  [+ Create Question]  [Search...]  [Filter: All Types ▼]    │
├─────────────────────────────────────────────────────────────┤
│  📝 Two Sum Problem                                    [OOP]│
│     Coding • Medium • Python        Used 3 times  [Send] [Edit]│
├─────────────────────────────────────────────────────────────┤
│  📝 What is polymorphism?                          [Concepts]│
│     Short Answer • Easy             Used 1 time   [Send] [Edit]│
├─────────────────────────────────────────────────────────────┤
│  📝 Binary Search Time Complexity                  [Algorithms]│
│     MCQ • Medium                    New           [Send] [Edit]│
└─────────────────────────────────────────────────────────────┘

During Class (Live Session Active):
┌─────────────────────────────────────────────────────────────┐
│  Quick Send from Bank (Collapsible Panel)                   │
├─────────────────────────────────────────────────────────────┤
│  Recent: Two Sum Problem [⚡ Send]                           │
│          Polymorphism    [⚡ Send]                           │
│  [Open Full Question Bank]                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Database Schema

The `instructor_question_bank` table already exists with this structure:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| instructor_id | uuid | Owner instructor |
| course_id | uuid | Associated course (for filtering) |
| org_id | uuid | Organization (optional) |
| title | text | Question title/summary |
| question_type | text | `coding`, `coding_simple`, `multiple_choice`, `short_answer` |
| question_content | jsonb | Full question data matching format-and-send-question expectations |
| difficulty | text | `easy`, `medium`, `hard` |
| tags | text[] | Custom tags for filtering |
| times_used | integer | Usage tracking |
| last_used_at | timestamp | When last deployed |
| created_at/updated_at | timestamps | Standard timestamps |

### question_content Structure by Type

**Coding Question:**
```json
{
  "question": "Problem statement",
  "title": "Two Sum",
  "language": "python",
  "difficulty": "Medium",
  "functionSignature": "def twoSum(nums: List[int], target: int) -> List[int]:",
  "constraints": ["2 <= nums.length <= 10^4", "..."],
  "examples": [
    { "input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "..." }
  ],
  "hints": ["Consider using a hash map"],
  "starterCode": "def twoSum(nums, target):\n    # Your code here\n    pass",
  "testCases": [
    { "input": [[2,7,11,15], 9], "expected": [0,1] }
  ]
}
```

**MCQ Question:**
```json
{
  "question": "What is the time complexity of binary search?",
  "options": ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n log n)"],
  "correctAnswer": "B",
  "explanation": "Binary search halves the search space each iteration..."
}
```

**Short Answer Question:**
```json
{
  "question": "Explain the difference between a class and an object in OOP.",
  "expectedAnswer": "A class is a blueprint/template that defines properties and methods, while an object is a specific instance of a class with actual values."
}
```

---

## Files to Create

### 1. `src/components/instructor/QuestionBankManager.tsx`
Main container component with tabs:
- Library view (list all questions)
- Create/Edit view (question editor)

### 2. `src/components/instructor/QuestionBankLibrary.tsx`
- Searchable, filterable list of saved questions
- Filter by: type, difficulty, tags, course
- Actions: Edit, Delete, Quick Send, Duplicate
- Usage statistics display

### 3. `src/components/instructor/QuestionBankEditor.tsx`
Full-featured question editor:
- Type selector (Coding, MCQ, Short Answer)
- Dynamic form based on type:
  - **Coding**: Title, problem statement, language, difficulty, examples, constraints, starter code, test cases, hints
  - **MCQ**: Question text, 4 options editor, correct answer selector, explanation
  - **Short Answer**: Question text, expected answer, grading notes
- Tag manager (add/remove tags)
- Preview mode (see how students will see it)
- Save to bank button

### 4. `src/components/instructor/QuestionBankQuickSend.tsx`
Compact panel shown during live sessions:
- Shows 3-5 most recently used/created questions
- One-click send button for each
- "Open Full Bank" link
- Integrates with existing `format-and-send-question` edge function

### 5. `src/components/instructor/CodingQuestionForm.tsx`
Specialized form for coding problems:
- Multi-language support (Python, Java, JavaScript, C++)
- Examples editor (input/output pairs)
- Constraints list editor
- Starter code with syntax highlighting (using existing CodeEditor)
- Test case builder

---

## Files to Modify

### 1. `src/pages/InstructorDashboard.tsx`
- Add "Question Bank" to nav items (between Materials and existing tabs)
- Render `QuestionBankManager` when tab is active
- Only show for STEM instructors (`professorType === "stem"`)

### 2. `src/components/instructor/LectureTranscription.tsx`
- Add collapsible "Quick Send from Bank" panel when session is active
- Show `QuestionBankQuickSend` component
- Wire up send functionality to existing question flow

### 3. `src/pages/SlidePresenter.tsx` (Optional Enhancement)
- Add "Send from Bank" button to slide controls
- Opens quick-select modal for bank questions

---

## Sending Questions from Bank

When a question from the bank is sent, the flow is:

1. Fetch question from `instructor_question_bank`
2. Call existing `format-and-send-question` edge function with:
   ```typescript
   {
     question_text: question.question_content.question,
     suggested_type: question.question_type,
     context: "Sent from Question Bank",
     options: question.question_content.options, // for MCQ
     correct_answer: question.question_content.correctAnswer, // for MCQ
     expected_answer: question.question_content.expectedAnswer, // for short answer
     // For coding, pass the full structure
   }
   ```
3. Update `times_used` and `last_used_at` in the bank
4. Create `student_assignments` for all students (existing flow)

---

## Component Architecture

```text
InstructorDashboard
├── QuestionBankManager (new tab)
│   ├── QuestionBankLibrary
│   │   └── QuestionCard (per question)
│   │       ├── Preview
│   │       ├── Edit button
│   │       ├── Delete button
│   │       └── Send button
│   └── QuestionBankEditor
│       ├── TypeSelector
│       ├── CodingQuestionForm (if coding)
│       ├── MCQQuestionForm (if MCQ)
│       ├── ShortAnswerQuestionForm (if short answer)
│       ├── TagManager
│       └── PreviewMode
│
└── LectureTranscription (existing)
    └── QuestionBankQuickSend (new collapsible)
        └── QuickQuestionCard (compact)
```

---

## Implementation Phases

### Phase 1: Core Question Bank (Create & Browse)
1. Create `QuestionBankManager.tsx` with tabs
2. Create `QuestionBankLibrary.tsx` with list/search/filter
3. Create `QuestionBankEditor.tsx` with full form
4. Create `CodingQuestionForm.tsx` for coding problems
5. Add "Question Bank" tab to InstructorDashboard

### Phase 2: Quick Deploy
1. Create `QuestionBankQuickSend.tsx` compact panel
2. Integrate into `LectureTranscription.tsx`
3. Wire up to `format-and-send-question` edge function
4. Track usage statistics

### Phase 3: Enhancements
1. Add preview mode in editor
2. Add duplicate question functionality
3. Add import/export (optional)
4. Add SlidePresenter integration

---

## UI/UX Details

### Question Card in Library
```text
┌────────────────────────────────────────────────────────┐
│ 💻 Two Sum Problem                            [Medium] │
│ Coding • Python • Last used 2 days ago                 │
│ Tags: arrays, hash-map, algorithms                     │
│                                                        │
│ [Preview] [Edit] [Duplicate] [Delete] [⚡ Send to Class]│
└────────────────────────────────────────────────────────┘
```

### Question Editor Layout
```text
┌─────────────────────────────────────────────────────────────┐
│ Create Question                         [Save] [Cancel]     │
├─────────────────────────────────────────────────────────────┤
│ Type: [Coding ▼]    Difficulty: [Medium ▼]    Lang: [Python]│
├─────────────────────────────────────────────────────────────┤
│ Title: [Two Sum                                           ] │
├─────────────────────────────────────────────────────────────┤
│ Problem Statement:                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Given an array of integers nums and an integer target,  │ │
│ │ return indices of the two numbers that add up to target.│ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Examples: [+ Add Example]                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Input: nums = [2,7,11,15], target = 9                   │ │
│ │ Output: [0,1]                                           │ │
│ │ Explanation: nums[0] + nums[1] == 9                     │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Constraints: [+ Add]                                        │
│ • 2 <= nums.length <= 10^4  [×]                             │
│ • -10^9 <= nums[i] <= 10^9  [×]                             │
├─────────────────────────────────────────────────────────────┤
│ Starter Code:                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ def twoSum(nums, target):                               │ │
│ │     # Your code here                                    │ │
│ │     pass                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Tags: [arrays] [hash-map] [+]                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Benefits

1. **Time Savings**: Create complex coding problems once, reuse across semesters
2. **Quality Control**: Pre-review questions before class, no live AI generation delays
3. **Consistency**: Same question format every time, no AI variation
4. **Tracking**: See which questions work well (usage stats)
5. **Organization**: Tag and filter by topic for curriculum planning
6. **Immediate Deploy**: One-click send during live sessions
