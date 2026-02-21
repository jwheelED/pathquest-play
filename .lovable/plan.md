
# Fix Multi-Course Data Isolation Bugs

## Problem Summary

Two related bugs cause courses to bleed into each other:

1. **Questions sent to ALL courses** -- The `useLectureRecording.ts` hook does not pass `course_id` when calling the `format-and-send-question` edge function, so the function falls into a fallback path that sends questions to every student across all courses.

2. **Same students shown in all courses** -- Several instructor dashboard components query `instructor_students` without filtering by `course_id`, so the same student list appears regardless of which course is selected.

## Root Cause Analysis

### Bug 1: Missing `course_id` in `useLectureRecording.ts`

The `LectureTranscription.tsx` component correctly passes `course_id: selectedCourseId` (line 1171), but the `useLectureRecording.ts` hook (used for slide-based lectures) does NOT accept or pass `course_id` at all (line 364-368). It just spreads `detectionData` which never contains a `course_id`.

In the edge function `format-and-send-question`, when `course_id` is null/missing, lines 846-857 execute:
```
// No course_id - get all instructor's students
const { data: allStudents } = await supabase
  .from("instructor_students")
  .select("student_id")
  .eq("instructor_id", user.id);
```
This returns every student across every course.

### Bug 2: Unscoped student queries in dashboard components

| Component | Issue |
|-----------|-------|
| `StudentProgressCard.tsx` (line 82-85) | Fetches all students with no `course_id` filter |
| `TeachingAnalytics.tsx` (line 44-47) | Fetches all students with no `course_id` filter |
| `LectureTranscription.tsx` (line 340-343) | Student count is unscoped -- shows total across all courses |

The `InstructorDashboard.tsx` `fetchStudents` and `InstructorOverview.tsx` already have proper course filtering using `.or('course_id.eq.{id},course_id.is.null')`, so those are fine.

## Fix Plan

### 1. Add `course_id` support to `useLectureRecording.ts`

- Add `courseId?: string` to the `UseLectureRecordingOptions` interface
- Store it in a ref so it stays current
- Pass `course_id: courseIdRef.current` in the `format-and-send-question` invocation body (line 364-368)
- Update the student count fetch (if present) to filter by course

### 2. Pass `selectedCourseId` when using `useLectureRecording`

- Find the component(s) that call `useLectureRecording()` and pass the `courseId` option from `useCourseContext()`

### 3. Fix `StudentProgressCard.tsx` -- scope to selected course

- Import `useCourseContext`
- Add `selectedCourseId` to the dependency array
- Filter `instructor_students` query with `.or('course_id.eq.{selectedCourseId},course_id.is.null')` when a course is selected
- Also scope the Realtime subscription filter to include course_id

### 4. Fix `TeachingAnalytics.tsx` -- scope to selected course

- Import `useCourseContext`
- Filter `instructor_students` query by `selectedCourseId`
- Add `selectedCourseId` to dependency array for re-fetch

### 5. Fix `LectureTranscription.tsx` student count -- scope to selected course

- The student count fetch at line 340-343 should filter by `selectedCourseId` (which is already available in the component)

## Files to Modify

1. **`src/hooks/useLectureRecording.ts`** -- Accept `courseId` option, pass it to edge function
2. **`src/components/instructor/StudentProgressCard.tsx`** -- Add course filtering to student query
3. **`src/components/instructor/TeachingAnalytics.tsx`** -- Add course filtering to student query
4. **`src/components/instructor/LectureTranscription.tsx`** -- Filter student count by course
5. **Any component calling `useLectureRecording`** -- Pass `courseId` from course context

## Technical Details

### useLectureRecording fix

```text
// In UseLectureRecordingOptions:
courseId?: string;

// In the hook body:
const courseIdRef = useRef(options.courseId);
useEffect(() => { courseIdRef.current = options.courseId; }, [options.courseId]);

// In format-and-send-question call (line 364-368):
body: {
  ...detectionData,
  course_context: courseContextRef.current,
  course_id: courseIdRef.current,  // <-- ADD THIS
}
```

### Student query filter pattern (consistent across all components)

```text
// When selectedCourseId is available:
.eq("instructor_id", instructorId)
.or(`course_id.eq.${selectedCourseId},course_id.is.null`)

// When no course selected:
// Show empty or skip fetch
```

This matches the existing pattern already used in `InstructorDashboard.tsx` and `InstructorOverview.tsx`.
