
# Expandable Student Response Viewer for Check-In Results

## Overview
Add collapsible/expandable sections in both **Question Bank Results** and **Live Lecture Check-In Results** so professors can view the full text of student short answer and coding submissions.

## Current State

### LectureCheckInResults.tsx
- **Coding questions**: Already has a basic `<details>` element for viewing code (lines 1387-1400), but it's minimal
- **Short answer questions**: Has a dedicated review section (lines 1503-1619) that shows the full text but not in an expandable format

### QuestionBankResults.tsx
- **Coding questions**: Shows truncated code preview (first 200 chars) in a small `<pre>` block
- **Short answer questions**: Shows truncated text in a `line-clamp-2` paragraph
- Neither type has expandable functionality

## Implementation Plan

### Phase 1: Create Reusable Expandable Response Component

Create a new component that handles the expandable view for both short answer and coding responses:

**New File**: `src/components/instructor/ExpandableStudentResponse.tsx`

Features:
- Collapsible container with smooth animation using Radix Collapsible
- Different styling for code (syntax-highlighted dark theme) vs text (light background)
- Shows student name, grade badge, and AI feedback when available
- ChevronDown icon that rotates when expanded
- Truncated preview when collapsed

```
+----------------------------------------+
| 👤 John Smith          [85%] [▼ View]  |
+----------------------------------------+
| (collapsed: "Osmosis is the moveme..." |
+----------------------------------------+

When expanded:
+----------------------------------------+
| 👤 John Smith          [85%] [▲ Hide]  |
+----------------------------------------+
| Osmosis is the movement of water       |
| molecules through a semipermeable      |
| membrane from an area of low solute    |
| concentration to high concentration... |
|                                        |
| 💬 AI Feedback: Good explanation of... |
+----------------------------------------+
```

### Phase 2: Update QuestionBankResults.tsx

Replace the current `renderAnswer` function with the new expandable component:

**Changes to `renderAnswer` function (lines 238-298)**:
1. For `short_answer`: Use Collapsible to show full text on expand
2. For `coding`/`coding_simple`: Use Collapsible with code block styling
3. Add expand/collapse button with visual indicator
4. Show AI feedback in expanded view

### Phase 3: Update LectureCheckInResults.tsx

Enhance both the student responses section and the short answer review section:

**Changes to student response rendering (around lines 1370-1400)**:
1. Replace `<details>` with styled Collapsible for coding
2. Add same expandable treatment for short answer responses in the main list

**Changes to short answer review section (lines 1503-1619)**:
1. Make the student answer text collapsible for long responses
2. Add visual indicator for expand/collapse
3. Keep the grading controls visible outside the collapsible area

### Phase 4: Add Coding Review Section to LectureCheckInResults

Add a dedicated "Student Code Submissions" section similar to the short answer review section (lines 1503-1619):

**New section for coding questions** (after line 1619):
- Similar structure to short answer review
- Syntax-highlighted code display
- AI grade and feedback display
- Manual grade override option

## Technical Details

### Collapsible Component Usage

```typescript
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

<Collapsible>
  <div className="flex items-center justify-between">
    <span>{studentName}</span>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm">
        <ChevronsUpDown className="h-4 w-4" />
        View Response
      </Button>
    </CollapsibleTrigger>
  </div>
  <CollapsibleContent>
    <div className="p-3 mt-2 rounded bg-muted">
      {/* Full response content */}
    </div>
  </CollapsibleContent>
</Collapsible>
```

### Code Display Styling

For coding responses, use consistent styling:
```typescript
<pre className="p-3 bg-slate-900 text-slate-100 rounded-md overflow-x-auto text-xs font-mono whitespace-pre-wrap">
  {studentCode}
</pre>
```

### Short Answer Display Styling

For text responses:
```typescript
<p className="text-sm text-muted-foreground whitespace-pre-wrap p-3 bg-muted/50 rounded">
  {studentAnswer}
</p>
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/instructor/QuestionBankResults.tsx` | Update `renderAnswer` function to use Collapsible for full text/code viewing |
| `src/components/instructor/LectureCheckInResults.tsx` | Add Collapsible to student responses, add dedicated coding review section |

## Visual Design

### QuestionBankResults - Expanded Response
```
+------------------------------------------+
| 👤 Alice Brown                    [85%]  |
| ┌──────────────────────────────────────┐ |
| │ ▼ View Full Response                 │ |
| ├──────────────────────────────────────┤ |
| │ Osmosis is the movement of water     │ |
| │ molecules through a semipermeable    │ |
| │ membrane from an area of lower       │ |
| │ solute concentration to higher...    │ |
| │                                      │ |
| │ 💬 AI: Great explanation, captured   │ |
| │    the key concept of passive...     │ |
| └──────────────────────────────────────┘ |
+------------------------------------------+
```

### LectureCheckInResults - Coding Submission
```
+------------------------------------------+
| Student Code Submissions & Grades        |
+------------------------------------------+
| 👤 John Smith                    [92%]   |
| ┌──────────────────────────────────────┐ |
| │ ▼ View Code                          │ |
| ├──────────────────────────────────────┤ |
| │ def fibonacci(n):                    │ |
| │     if n <= 1:                       │ |
| │         return n                     │ |
| │     return fibonacci(n-1) + ...      │ |
| │                                      │ |
| │ 💬 AI: Correct recursive solution,   │ |
| │    good base case handling.          │ |
| └──────────────────────────────────────┘ |
+------------------------------------------+
```

## Implementation Order

1. Update `QuestionBankResults.tsx` - Add Collapsible imports and update `renderAnswer`
2. Update `LectureCheckInResults.tsx` - Replace `<details>` with Collapsible for coding responses
3. Add coding review section to `LectureCheckInResults.tsx` (similar to short answer section)
4. Test expand/collapse functionality across question types
