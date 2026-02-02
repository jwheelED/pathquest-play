
# Question Studio Enhancement for STEM/Coding Classes

## Overview

This plan enhances the existing Question Studio to fully support STEM instructors who want to create programming problems (including OOP exercises like Library/Book composition) before class and then send them to students during live lectures.

## What This Enables

Your professor will be able to:
1. **Create coding problems before class** - Including multi-class OOP exercises (e.g., Library has-a Book)
2. **Save questions to a library** - Organized by course
3. **Send saved questions during live lecture** - One-click deployment to all connected students
4. **AI auto-grading** - Students get immediate feedback on their code submissions

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Question Studio (Enhanced)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ MCQ Creator │  │ Short Answer │  │ Coding Problem Creator  │ │
│  │ (existing)  │  │ (existing)   │  │    (NEW - simple/full)  │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│                            ↓                                     │
│                   ┌────────────────┐                            │
│                   │ Question Bank  │                            │
│                   │  (NEW table)   │                            │
│                   └────────────────┘                            │
│                            ↓                                     │
│       ┌────────────────────────────────────────┐                │
│       │      Live Lecture Quick-Send Panel      │                │
│       │  [OOP Basics] [Recursion] [Data Types]  │                │
│       └────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Phase 1: Database Schema

Create a new `instructor_question_bank` table to store pre-created questions:

**Table: `instructor_question_bank`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| instructor_id | uuid | Owner instructor |
| course_id | uuid | Associated course (optional) |
| title | text | Question title for easy reference |
| question_type | text | `multiple_choice`, `short_answer`, `coding`, `coding_simple` |
| question_content | jsonb | Full question data (options, starter code, test cases, etc.) |
| tags | text[] | Searchable tags like "OOP", "composition", "loops" |
| difficulty | text | `easy`, `medium`, `hard` |
| times_used | integer | Track popularity |
| last_used_at | timestamp | For sorting |
| created_at | timestamp | Creation time |
| org_id | uuid | Organization scope |

### Phase 2: Enhanced Question Studio UI

Update the Question Studio component to:

1. **Add Coding Question Creator** - Form for creating coding problems with:
   - Problem statement (rich text with LaTeX support)
   - Function name and signature
   - Starter code template
   - Expected behavior description (for AI grading)
   - Example inputs/outputs
   - Difficulty selector
   - Tags for organization

2. **Question Bank View** - New tab showing saved questions:
   - Filter by type, tags, difficulty
   - Search by title or content
   - Quick preview cards
   - Edit/delete/duplicate options

3. **Save to Bank** - Add "Save" button alongside "Send Now":
   - Questions can be saved for later use
   - Optional: Save and immediately send

### Phase 3: Live Lecture Quick-Send Panel

Add a new component to the Live Lecture tab:

1. **QuickSendQuestionBank** - Panel showing saved questions:
   - Grouped by tags or recent usage
   - One-click "Send to Class" button
   - Shows response count in real-time
   - Filters for current course

2. **Integration with LectureTranscription** - Add button to open saved questions

### Phase 4: StudioQuestionCard Enhancement

Update the card component to display coding questions:

1. **Coding question preview** - Show:
   - Problem statement
   - Starter code (syntax highlighted)
   - Expected behavior
   - Difficulty badge

2. **Editing support** - Allow inline editing of coding problems

---

## Files to Create/Modify

### New Files
1. `src/components/instructor/QuestionBankPanel.tsx` - Question library browser
2. `src/components/instructor/CodingQuestionCreator.tsx` - Coding problem form
3. `src/components/instructor/QuickSendPanel.tsx` - Live lecture send interface
4. `supabase/migrations/add_instructor_question_bank.sql` - Database migration

### Modified Files
1. `src/components/instructor/QuestionStudio.tsx` - Add coding type, save functionality
2. `src/components/instructor/StudioQuestionCard.tsx` - Add `coding` and `coding_simple` support
3. `src/components/instructor/LiveSessionControls.tsx` - Add QuickSendPanel
4. `src/integrations/supabase/types.ts` - Add new table types

---

## Example Coding Question Structure

For the professor's Library/Book composition example:

```json
{
  "question_type": "coding",
  "title": "Library-Book Composition",
  "question_content": {
    "problem": "Create a Library class that has a composition relationship with a Book class. The Library should be able to add books and list all book titles.",
    "function_name": "Library",
    "language": "java",
    "starter_code": "public class Book {\n    // Your code here\n}\n\npublic class Library {\n    // Your code here\n}",
    "expected_behavior": "Library class contains Book objects. addBook() adds a book. listTitles() returns all book titles.",
    "examples": [
      "Library lib = new Library();\nlib.addBook(new Book(\"1984\"));\nlib.listTitles(); // Returns [\"1984\"]"
    ],
    "concepts_tested": ["composition", "has-a relationship", "encapsulation"]
  },
  "difficulty": "medium",
  "tags": ["OOP", "composition", "relationships"]
}
```

---

## User Experience Flow

### Before Class (Prep Time)
1. Instructor opens Question Studio
2. Selects "Coding Question" type
3. Enters problem details (Library/Book example)
4. Clicks "Save to Question Bank"
5. Question appears in their library

### During Class (Live)
1. Instructor starts live lecture recording
2. When ready, opens "Saved Questions" panel
3. Finds "Library-Book Composition" question
4. Clicks "Send to Class"
5. All connected students receive the coding problem
6. Students write and submit their code
7. AI grades submissions in real-time
8. Instructor sees results dashboard

---

## Estimated Implementation Time

| Phase | Effort |
|-------|--------|
| Phase 1: Database | 1 message |
| Phase 2: Question Studio UI | 2-3 messages |
| Phase 3: Quick-Send Panel | 1-2 messages |
| Phase 4: Card Enhancement | 1 message |
| **Total** | **5-7 messages** |

---

## Benefits

- **Preparation time** - Instructors can create quality problems outside of class
- **Consistency** - Same problem can be reused across sections
- **Organization** - Tagged and searchable question library
- **Quick deployment** - One-click send during live lectures
- **Immediate feedback** - AI auto-grading for coding submissions
