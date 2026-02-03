

# Add Question Bank for Humanities Instructors (MCQ + Short Answer Only)

## Overview

This plan extends the Question Bank feature to humanities instructors, but only with **Multiple Choice** and **Short Answer** question types (no coding questions).

---

## Changes Required

### 1. Modify `src/pages/InstructorDashboard.tsx`

**Current behavior:** The Question Bank tab is only shown for STEM instructors (`stemOnly: true`).

**Change:** Remove the `stemOnly` restriction so all instructors can access the Question Bank.

```typescript
// Line 41-48: Remove stemOnly from question-bank nav item
const baseNavItems: { value: TabValue; label: string; icon: React.ElementType; stemOnly?: boolean }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "live", label: "Live Lecture", icon: Radio },
  { value: "question-bank", label: "Question Bank", icon: Library }, // Remove stemOnly: true
  { value: "recorded", label: "Pre-Recorded", icon: Video },
  { value: "students", label: "Students", icon: Users },
  { value: "materials", label: "Materials", icon: FileText },
];
```

**Also pass professorType to the component:**

```typescript
// When rendering QuestionBankManager, pass professorType
<QuestionBankManager 
  courseId={selectedCourseId || undefined} 
  professorType={professorType}
/>
```

---

### 2. Modify `src/components/instructor/question-bank/QuestionBankManager.tsx`

**Add a `professorType` prop** that gets passed down to the editor:

```typescript
interface QuestionBankManagerProps {
  courseId?: string;
  professorType?: 'stem' | 'humanities' | 'medical' | null;
  onSendQuestion?: (question: QuestionBankItem) => void;
  isLiveSession?: boolean;
}
```

Pass it to `QuestionBankEditor`:

```typescript
<QuestionBankEditor 
  courseId={courseId}
  editingQuestion={editingQuestion}
  onSave={handleSaveComplete}
  onCancel={handleCancel}
  professorType={professorType}
/>
```

---

### 3. Modify `src/components/instructor/question-bank/QuestionBankEditor.tsx`

**Add `professorType` prop** and conditionally hide the Coding option:

```typescript
interface QuestionBankEditorProps {
  courseId?: string;
  editingQuestion: QuestionBankItem | null;
  professorType?: 'stem' | 'humanities' | 'medical' | null;
  onSave: () => void;
  onCancel: () => void;
}
```

**In the Question Type selector**, only show Coding options for STEM/Medical:

```typescript
<SelectContent>
  {/* Only show coding options for STEM professors */}
  {professorType !== 'humanities' && (
    <SelectItem value="coding">
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4" />
        Coding Problem
      </div>
    </SelectItem>
  )}
  <SelectItem value="multiple_choice">
    <div className="flex items-center gap-2">
      <ListChecks className="h-4 w-4" />
      Multiple Choice
    </div>
  </SelectItem>
  <SelectItem value="short_answer">
    <div className="flex items-center gap-2">
      <MessageSquare className="h-4 w-4" />
      Short Answer
    </div>
  </SelectItem>
</SelectContent>
```

**Set default question type** based on professor type:

```typescript
// In useEffect when resetting form for new question
setQuestionType(professorType === 'humanities' ? 'multiple_choice' : 'coding');
```

---

### 4. Modify `src/components/instructor/question-bank/QuestionBankLibrary.tsx`

**Add `professorType` prop** and filter coding option in type filter dropdown:

```typescript
interface QuestionBankLibraryProps {
  courseId?: string;
  professorType?: 'stem' | 'humanities' | 'medical' | null;
  onEdit: (question: QuestionBankItem) => void;
  onCreateNew: () => void;
  onSend?: (question: QuestionBankItem) => void;
  isLiveSession?: boolean;
}
```

**Update the type filter dropdown:**

```typescript
<SelectContent>
  <SelectItem value="all">All Types</SelectItem>
  {professorType !== 'humanities' && (
    <SelectItem value="coding">Coding</SelectItem>
  )}
  <SelectItem value="multiple_choice">MCQ</SelectItem>
  <SelectItem value="short_answer">Short Answer</SelectItem>
</SelectContent>
```

---

## Summary of File Changes

| File | Change |
|------|--------|
| `src/pages/InstructorDashboard.tsx` | Remove `stemOnly` from question-bank nav item, pass `professorType` prop |
| `src/components/instructor/question-bank/QuestionBankManager.tsx` | Add `professorType` prop, pass to child components |
| `src/components/instructor/question-bank/QuestionBankEditor.tsx` | Add `professorType` prop, conditionally hide Coding option, set default type |
| `src/components/instructor/question-bank/QuestionBankLibrary.tsx` | Add `professorType` prop, conditionally hide Coding in filter |

---

## Result

- **STEM Instructors**: Full Question Bank with Coding, MCQ, and Short Answer
- **Humanities Instructors**: Question Bank with only MCQ and Short Answer (no coding options visible)
- **Medical Instructors**: Same as STEM (Coding, MCQ, Short Answer)

The existing data structure and edge function integrations remain unchanged—the only difference is UI-level filtering of which question types are available for creation and filtering.

