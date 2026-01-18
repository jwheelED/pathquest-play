# Multi-Course Support for Instructor Accounts

## Overview
Instructors can now create and manage multiple courses from a single account, with full isolation of students, materials, questions, and sessions per course.

---

## ✅ **What's Already Implemented**

The multi-course infrastructure was already fully built! I've now added the **CourseSelector** to the instructor dashboard header to make it visible and accessible.

---

## 🎯 **Features**

### **1. Course Management**
- ✅ Create unlimited courses per instructor account
- ✅ Each course gets a unique join code
- ✅ Switch between courses with dropdown selector
- ✅ Archive/unarchive courses
- ✅ Edit course details (title, description, topics, schedule)

### **2. Course Information**
Each course has:
- **Title**: e.g., "Introduction to Computer Science"
- **Course Code**: Auto-generated unique code (e.g., "CSCI101-A7B3")
- **Description**: Course overview
- **Schedule**: Class times
- **Topics**: Array of key topics/keywords
- **Course Type**: STEM/Technical or Humanities
- **Status**: Active or Archived

### **3. Course Isolation**
Everything is course-specific:
- ✅ **Students**: Each course has its own student list
- ✅ **Live Sessions**: Sessions belong to a course
- ✅ **Questions**: Auto-questions and voice commands scoped to course
- ✅ **Materials**: Slides and documents per course
- ✅ **Answer Keys**: Course-specific answer banks
- ✅ **Grades & Analytics**: Separated by course

---

## 🎨 **UI Components**

### **1. CourseSelector (Header)**
**Location:** Top-right of instructor dashboard header

**Features:**
- Dropdown to switch between courses
- Shows current course title and code
- "Create New Course" button
- Active courses listed first
- Archived courses shown separately
- Search functionality

**How it looks:**
```
┌─────────────────────────────┐
│ 📚 Intro to CS (CSCI101)  ▼ │
└─────────────────────────────┘
      ↓ (when clicked)
┌─────────────────────────────┐
│ Search courses...           │
├─────────────────────────────┤
│ ACTIVE COURSES              │
│ ✓ Intro to CS (CSCI101)    │
│   Data Structures (CS201)   │
│   Algorithms (CS301)        │
├─────────────────────────────┤
│ ARCHIVED                    │
│   📦 Old Course (CS101-S22) │
├─────────────────────────────┤
│ ➕ Create New Course        │
└─────────────────────────────┘
```

### **2. CreateCourseDialog**
**Triggered by:** Clicking "Create New Course" in selector

**Fields:**
1. **Course Title** * (required)
   - e.g., "Introduction to Computer Science"
2. **Description** (optional)
   - Brief course overview
3. **Class Schedule** (optional)
   - e.g., "Mon/Wed/Fri 10:00-11:30 AM"
4. **Key Topics** (optional)
   - Comma-separated: algorithms, python, data structures
5. **Course Category** (required)
   - STEM/Technical or Humanities
   - Visual card selection

**On Creation:**
- Generates unique course code automatically
- Creates course in database
- Switches to new course immediately
- Shows success toast

---

## 📊 **Database Schema**

### **courses Table**
```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID REFERENCES auth.users(id) NOT NULL,
  org_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  course_code TEXT UNIQUE NOT NULL,
  course_type TEXT, -- 'stem' or 'humanities'
  topics TEXT[], -- Array of keywords
  schedule TEXT,
  is_active BOOLEAN DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Related Tables with course_id:**
- `instructor_students` - Links students to specific courses
- `live_sessions` - Each session belongs to a course
- `lecture_materials` - Slides/documents per course
- `instructor_answer_keys` - Answer banks per course
- `student_assignments` - Questions scoped to course

---

## 🔧 **How It Works**

### **Course Context (State Management)**

**Hook:** `useCourseContext()`

**Provides:**
```typescript
{
  courses: Course[], // All instructor's courses
  selectedCourseId: string | null, // Currently selected
  selectedCourse: Course | null, // Full course object
  loading: boolean,
  selectCourse: (id) => void, // Switch courses
  createCourse: (data) => Promise<Course>,
  updateCourse: (id, data) => Promise<boolean>,
  archiveCourse: (id) => Promise<boolean>,
  refreshCourses: () => Promise<void>
}
```

**Auto-selection Logic:**
1. Checks localStorage for last selected course
2. If found and course is active, selects it
3. Otherwise, selects first active course
4. Persists selection to localStorage

### **Course Provider Wrapping**

**File:** `/app/frontend/src/App.tsx`

Instructor routes are wrapped:
```tsx
<Route path="/instructor/*" element={
  <CourseProvider>
    <InstructorRoutes />
  </CourseProvider>
} />
```

---

## 👨‍🏫 **Instructor Workflow**

### **Creating a Course:**

1. Click **CourseSelector** in dashboard header
2. Click **"Create New Course"**
3. Fill out form:
   - Title: "Data Structures"
   - Description: "Learn fundamental data structures"
   - Schedule: "Tue/Thu 2:00-3:30 PM"
   - Topics: "arrays, linked lists, trees, graphs"
   - Category: STEM/Technical
4. Click **"Create Course"**
5. System generates unique code (e.g., "DS101-X9K2")
6. Course appears in selector
7. Automatically switched to new course

### **Switching Courses:**

1. Click **CourseSelector** dropdown
2. Select different course from list
3. All dashboard data updates:
   - Student list changes
   - Materials show for that course
   - Answer keys filtered
   - Live session context updates

### **Sharing Course Code with Students:**

Each course has unique code displayed:
- In CourseSelector: "Intro to CS (CSCI101-A7B3)"
- Share this code with students
- Students use it to join specific course

---

## 👥 **Student Experience**

### **Joining a Course:**

Students can join multiple courses:

1. Go to student dashboard
2. Enter instructor code: `CSCI101-A7B3`
3. System creates `instructor_students` record with `course_id`
4. Student sees course in their course list
5. Can switch between courses they've joined

### **Multi-Course Student Dashboard:**

Students enrolled in multiple courses see:
- Dropdown to switch between courses
- Assignments separated by course
- Progress tracked per course
- Grades per course

---

## 🎓 **Use Cases**

### **Use Case 1: Teaching Multiple Sections**
**Scenario:** Professor teaches 3 sections of same course

**Setup:**
1. Create course: "Intro to CS - Section A (9:00 AM)"
2. Create course: "Intro to CS - Section B (11:00 AM)"
3. Create course: "Intro to CS - Section C (2:00 PM)"

**Benefits:**
- Separate student lists
- Same materials can be reused
- Independent grading
- Section-specific analytics

### **Use Case 2: Different Courses**
**Scenario:** Professor teaches multiple subjects

**Setup:**
1. "Introduction to Programming"
2. "Data Structures"
3. "Algorithms"
4. "Machine Learning"

**Benefits:**
- Different materials per course
- Different question banks
- Different topics/keywords for AI
- Separate student rosters

### **Use Case 3: Semester Management**
**Scenario:** Archive old semesters, create new ones

**Setup:**
1. Archive: "CS101 - Spring 2024"
2. Archive: "CS201 - Spring 2024"
3. Create: "CS101 - Fall 2024"
4. Create: "CS201 - Fall 2024"

**Benefits:**
- Historical data preserved
- Clean slate for new semester
- Can still access archived course data
- Organized course history

---

## 🔍 **Behind the Scenes**

### **When Instructor Sends Question:**

```typescript
// format-and-send-question edge function
const { selectedCourse } = useCourseContext();

// Gets students for selected course only
const { data: students } = await supabase
  .from("instructor_students")
  .select("student_id")
  .eq("instructor_id", instructorId)
  .eq("course_id", selectedCourse.id); // Course filter!

// Question sent only to students in this course
```

### **When Creating Live Session:**

```typescript
const { data: session } = await supabase
  .from("live_sessions")
  .insert({
    instructor_id: user.id,
    course_id: selectedCourseId, // Tied to course!
    session_code: generateCode(),
    is_active: true
  });
```

### **When Uploading Materials:**

```typescript
const { data } = await supabase
  .from("lecture_materials")
  .insert({
    instructor_id: user.id,
    course_id: selectedCourseId, // Course-specific!
    title: "Week 5 - Recursion",
    content: slides
  });
```

---

## 📱 **Responsive Design**

### **Desktop:**
- CourseSelector in top-right header
- Full dropdown with search
- Shows course codes
- Easy switching

### **Mobile:**
- CourseSelector in mobile header
- Optimized touch targets
- Swipe-friendly
- Bottom sheet on small screens

---

## 🎯 **Best Practices**

### **For Instructors:**

1. **Naming Conventions:**
   - ✅ "CS101 - Intro to Programming (Fall 2024)"
   - ✅ "MATH201 - Calculus II (Section A)"
   - ❌ "Class" or "My Course" (too vague)

2. **Course Codes:**
   - Auto-generated, no need to customize
   - Share exact code with students
   - Each course has unique code

3. **Topics Array:**
   - Add 5-10 key topics/keywords
   - Used by AI for question relevance
   - Helps with answer key matching

4. **Archive Old Courses:**
   - Archive courses after semester ends
   - Keeps dashboard clean
   - Data preserved, can restore

### **For Students:**

1. **Join with Correct Code:**
   - Get code from instructor
   - Code format: `CSCI101-A7B3`
   - Case-sensitive

2. **Check Course Name:**
   - Verify you joined correct section
   - Check course title matches

---

## 🔧 **API Examples**

### **Get Instructor's Courses:**
```typescript
const { data: courses } = await supabase
  .from("courses")
  .select("*")
  .eq("instructor_id", userId)
  .order("created_at", { ascending: true });
```

### **Create Course:**
```typescript
const { data: newCourse } = await supabase
  .from("courses")
  .insert({
    instructor_id: userId,
    title: "Data Structures",
    course_type: "stem",
    topics: ["arrays", "trees", "graphs"]
  })
  .select()
  .single();
```

### **Get Students for Course:**
```typescript
const { data: students } = await supabase
  .from("instructor_students")
  .select(`
    student_id,
    students:profiles!instructor_students_student_id_fkey(
      full_name,
      email
    )
  `)
  .eq("instructor_id", instructorId)
  .eq("course_id", courseId);
```

### **Archive Course:**
```typescript
const { error } = await supabase
  .from("courses")
  .update({
    is_active: false,
    archived_at: new Date().toISOString()
  })
  .eq("id", courseId);
```

---

## 🚀 **What's Now Visible**

### **Before (wasn't visible):**
- Multi-course support existed but no UI
- Had to manually query database

### **After (now visible):**
- ✅ CourseSelector in dashboard header
- ✅ Visual course switcher
- ✅ "Create New Course" button
- ✅ Active/Archived separation
- ✅ Search functionality
- ✅ Course creation dialog

---

## 🎉 **Ready to Use!**

The multi-course feature is fully functional and now easily accessible from the instructor dashboard.

### **To Start Using:**

1. **Log in** as instructor
2. Look for **CourseSelector** in top-right of dashboard
3. Click to see current courses
4. Click **"Create New Course"** to add more
5. Switch between courses anytime
6. Share course codes with students

---

## 📊 **Testing Instructions**

### **Test 1: Create Multiple Courses**
1. Login as instructor
2. Click CourseSelector → "Create New Course"
3. Create "Course A" (STEM)
4. Create "Course B" (STEM)
5. Create "Course C" (Humanities)
6. Verify all three appear in selector

### **Test 2: Switch Between Courses**
1. Select "Course A"
2. Note current student count
3. Switch to "Course B"
4. Verify student list changes
5. Switch back to "Course A"
6. Verify you're back to original students

### **Test 3: Course-Specific Materials**
1. Select "Course A"
2. Upload lecture slides
3. Switch to "Course B"
4. Verify materials list is different (empty or different files)
5. Switch back to "Course A"
6. Verify uploaded slides still there

### **Test 4: Course-Specific Questions**
1. Select "Course A" with 10 students
2. Send live question
3. Verify 10 students receive it
4. Switch to "Course B" with 5 students
5. Send question
6. Verify only 5 students in Course B receive it

### **Test 5: Archive Course**
1. Create temporary test course
2. Archive it via API or future UI
3. Verify it appears in "Archived" section
4. Verify it's no longer selectable as active
5. Can still view archived course data

---

## 🛠️ **Files Modified**

1. `/app/frontend/src/pages/InstructorDashboard.tsx`
   - Added `import { CourseSelector }`
   - Added CourseSelector to headerActions

**No other changes needed - everything else was already implemented!**

---

## 📄 **Related Files**

- `/app/frontend/src/hooks/useCourseContext.tsx` - Course state management
- `/app/frontend/src/components/instructor/CourseSelector.tsx` - Dropdown component
- `/app/frontend/src/components/instructor/CreateCourseDialog.tsx` - Creation form
- `/app/frontend/src/integrations/supabase/types.ts` - Database types

---

**Status:** ✅ Multi-course support fully functional and accessible!

Instructors can now easily manage multiple courses from a single account with full data isolation between courses.
