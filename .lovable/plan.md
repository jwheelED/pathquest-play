

# Show Live Session Results When Recording with Active Session

## Problem
When a professor starts recording while a live session is active, the check-in results section at the bottom of the Live Copilot tab always shows class-wide `LectureCheckInResults` (from `student_assignments`). It should instead show the **live session's real-time results** (from `live_questions` + `live_responses`) when there's an active session.

## Solution
Update `LiveResponsesEmpty` to conditionally render either `LiveSessionResults` (when an active session exists) or `LectureCheckInResults` (when no session is active). Pass the active session ID down.

## Changes

### `src/components/instructor/LiveResponsesEmpty.tsx`
- Accept an optional `activeSessionId` prop (already receiving `hasActiveSession` boolean)
- When `activeSessionId` is truthy, render `<LiveSessionResults sessionId={activeSessionId} />` instead of `<LectureCheckInResults />`
- When no active session, keep showing `<LectureCheckInResults />` as fallback

### `src/pages/InstructorDashboard.tsx`
- Pass `activeSessionId={activeSession?.id}` to `<LiveResponsesEmpty>` (line ~613)
- The `activeSession` object is already available in scope

### No other files changed
`LiveSessionResults` already exists with full question/response rendering, accordion UI, accuracy stats, and real-time refresh. It accepts a `sessionId` string prop and handles all data fetching internally.

