# Bug: Question Bank pushes don't reach live-session participants

## Root cause (confirmed from code + schema)

There are two delivery pipelines and they are not equivalent:

**Copilot / voice / auto questions** → `supabase/functions/format-and-send-question`
- Looks up the instructor's active `live_sessions` row.
- If one exists: inserts into `live_questions` (anonymous live participants subscribe here via Supabase Realtime in `src/pages/LiveStudent.tsx` line 199–210).
- THEN also inserts into `student_assignments` (authenticated/registered students).
- This is explicitly called "dual delivery mode" in the code.

**Question Bank push** → `supabase/functions/push-bank-question`
- Only inserts into `student_assignments`.
- Never checks for an active `live_sessions` row.
- Never writes to `live_questions`.

Result: anyone who joined the live session via the 6-digit code / QR (anonymous Kahoot-style join) is subscribed to `live_questions` only. Bank pushes never land there, so their screens stay empty. Registered students who are also enrolled in the course still receive it via `student_assignments`, which is why the bug looks intermittent depending on who's in the room.

## Fix

Make `push-bank-question` mirror the dual-delivery logic from `format-and-send-question`.

### Edit `supabase/functions/push-bank-question/index.ts`

After verifying the instructor owns the question and before the existing `student_assignments` batch insert (around line 135, right before "Format the question content"):

1. Query for an active live session for this instructor:
   ```ts
   const { data: liveSession } = await supabase
     .from("live_sessions")
     .select("id, session_code")
     .eq("instructor_id", user.id)
     .eq("is_active", true)
     .order("created_at", { ascending: false })
     .limit(1)
     .maybeSingle();
   ```

2. If `liveSession` exists, build the same payload shape `live_questions.question_content` expects (the formatted question body — same `formattedQuestion` object the bank already constructs, including `title` and `difficulty`), compute `question_number` via a count on `live_questions` for that `session_id`, and insert one row into `live_questions`. Log failures but don't abort — keep going so registered students still get it.

3. Continue with the existing `student_assignments` batched insert unchanged (preserves backward compatibility for registered/enrolled students, matches the copilot's dual-delivery behavior).

4. Include `sessionCode` and `liveDelivered: true/false` in the success response so the UI can optionally surface that the question went to the live room as well.

### Why this is safe

- `live_questions` schema (`session_id`, `instructor_id`, `question_content` jsonb, `question_number`, `sent_at`) is already what the copilot writes — no migration needed.
- Students on `LiveStudent.tsx` are already subscribed to realtime INSERTs on `live_questions` filtered by `session_id`, so they'll pick it up automatically with no client changes.
- Registered students continue to receive via the existing `student_assignments` path, so nothing regresses.
- No DB schema changes, no new RLS, no client changes.

### Out of scope / not changing

- `PushQuestionDialog.tsx` UI — no change required, but we could later add a "delivered to N live participants" line using the new response field (optional follow-up).
- The `format-and-send-question` pipeline — already correct.
- Realtime subscriptions in `LiveStudent.tsx` — already correct.

## Verification after fix

1. Start a live session as instructor, have a second browser join anonymously via the 6-digit code.
2. Open Question Bank, push any question.
3. Confirm the anonymous participant's screen shows the question within ~1s (realtime).
4. Check edge function logs for `push-bank-question` — should see a "LIVE SESSION DETECTED" log and a successful `live_questions` insert.
