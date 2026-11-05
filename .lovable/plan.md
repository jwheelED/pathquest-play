# Live Session Link: one answering experience with account-linked history

## Goal

Enrolled students join live sessions with one tap from their course dashboard — no 6-digit code, no nickname prompt — and their live answers, confidence choices, and AI feedback are saved to their permanent course history. Guests keep the anonymous code + nickname path unchanged. Practice questions stay in the dashboard as-is; missed check-in makeup is a later follow-up.

## Current state

- `live_sessions` already has `course_id` — sessions know their course.
- `live_participants` is fully anonymous (id, nickname, session_id only — no account link).
- `ActiveLiveTranscriptSection` already detects active sessions for a student's course in real time, but only offers a read-along transcript, not a join button.
- Live answers go to `live_responses` keyed by anonymous participant; student history lives in `student_assignments`. The two never connect.

## Changes

### 1. Database migration
- Add nullable `user_id` (uuid → auth.users) to `live_participants`, with a unique index on `(session_id, user_id)` so a rejoining student reuses their row instead of duplicating.
- RLS policies so a signed-in student can read their own `live_participants` row and their own `live_responses` (needed for the history view). All writes stay service-role only.

### 2. `join-live-session` edge function
- Accept an optional auth token. When present and valid: attach `user_id` to the participant row, default the nickname to the student's profile name, and reuse an existing participant row for that user+session (upsert).
- No token → existing anonymous flow, untouched.

### 3. One-tap join from the course dashboard
- Extend `ActiveLiveTranscriptSection` with a prominent **"Join live session"** button (it already knows the active session and code).
- Clicking it calls `join-live-session` with the student's auth token, stores the returned participant id, and navigates to `/live/{code}` — landing directly in the listening phase.

### 4. `LiveStudent` page auto-join
- If the visitor is signed in and has no participant id for this session, auto-join with their account instead of showing the nickname gate.
- Signed-out visitors keep the code + nickname flow exactly as today.

### 5. Student live history (results tracking)
- New "Live session history" section on the student dashboard: per past session, each question with their answer, correct/incorrect, confidence choice, and AI grade/feedback — read from `live_responses` via the new `user_id` link (no data duplication).
- Reuses the existing recap/feedback visual language.

## Technical details

- Migration: `alter table live_participants add column user_id uuid references auth.users(id);` + unique partial index `where user_id is not null` + two RLS select policies.
- `join-live-session/handler.ts` gets an optional `userId` in its deps; unit tests updated for both paths (linked join, guest join, rejoin dedup).
- Client: `ActiveLiveTranscriptSection.tsx`, `LiveStudent.tsx`, `useSessionState.ts` (pass token on join), new `LiveSessionHistory.tsx` under `src/components/student/`.
- Terminology per project memory: "Session", "Participant"; educational language only.

## Out of scope (confirmed with you)

- Practice questions from uploaded notes — unchanged, stays in dashboard.
- Missed check-in makeup flow — noted as a future follow-up, not built here.
- No changes to question generation, images, or the instructor side.
