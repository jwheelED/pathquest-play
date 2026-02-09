
## Fix: Separate Live Session Data from Check-In Results

### Problem
When a live session is active, the `format-and-send-question` edge function sends questions to **both** the `live_questions` table (for anonymous participants) and the `student_assignments` table (for registered students). This causes the check-in results card to show inconsistent data:
- The pie chart counts anonymous responses (from `live_responses`)
- The bar chart and response list only show `student_assignments` data
- Result: "0/8 responded" even though students answered via the live session

### Solution
Stop writing to `student_assignments` during live sessions. Live session data should only appear in:
1. **Presenter View** (real-time stats during the session)
2. **Past Live Sessions** section (historical review)

### Changes

#### 1. Edge Function: `supabase/functions/format-and-send-question/index.ts`
- Remove the block (lines ~805-871) that creates `student_assignments` records when a live session is active
- Keep only the `live_questions` insert for anonymous participants
- Update the response payload to remove `registeredStudentCount`
- Update the success log accordingly

#### 2. No frontend changes needed
- `LectureCheckInResults` already only reads from `student_assignments` -- once we stop writing there during live sessions, it will naturally stop showing live session questions
- `PastLiveSessions` and `LiveSessionResults` read from `live_questions`/`live_responses` and will continue working as-is
- The presenter view reads from `live_questions`/`live_responses` via `usePresenterData` and is unaffected

### Technical Details

In `format-and-send-question/index.ts`, the live session branch (starting ~line 773) currently:

```text
1. Inserts into live_questions          <-- KEEP
2. Fetches instructor_students          <-- REMOVE
3. Creates student_assignments records  <-- REMOVE
4. Returns hybrid response              <-- SIMPLIFY
```

After the change, the live session branch will only insert into `live_questions` and return the live-only response. The standard (non-live) code path for `student_assignments` remains completely unchanged.
