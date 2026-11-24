# Voice "Send question N" from uploaded worksheets

## What you get
- Upload a worksheet as usual. Edvana notices it has numbered questions, marks it a **Worksheet** (you can switch that off), and splits it into Question 1, 2, 3...
- For any question with no choices or answer key, AI writes the correct answer and realistic choices at upload. You can review and edit each one before class.
- During a live session, an **Active worksheet** picker sits in the recording controls. If you say something like "take out worksheet 4", Edvana suggests switching to it with one tap.
- Say "send question 2" (also "send problem 2", "number two", "2a"). It goes straight to participants, and a toast shows "Sent Q2 from Worksheet 4" with **Undo** for 5 seconds. The send is held for those 5 seconds, so Undo really stops it.

## Decisions (from interview)
- Worksheet choice: you pin it, plus a spoken-name suggestion
- Send: immediately, with a 5-second undo
- Missing answers: AI fills them in at upload, and you can edit them
- Worksheet detection: automatic, with a toggle

## Edge cases (defaults)
- No worksheet pinned: a toast says "Pick a worksheet first" and nothing is sent.
- Question number doesn't exist: a toast says "Worksheet 4 has no question 9."
- Sub-parts: "question 2" sends 2a if parts exist; "2b" sends that part.
- Already sent this session: it's sent again (a "sent before" label shows in the toast).
- An item with a picture or table it can't read: sent as short answer, with the text only.
- Auto-question timer keeps running; a worksheet send resets the interval countdown.

## Technical details
- New table `worksheet_items` (material_id, course_id, instructor_id, number, part, prompt, question_type, options jsonb, correct_answer, explanation, ai_filled bool, edited bool). It gets grants and RLS scoped to the owning instructor. Add an `is_worksheet` boolean on `lecture_materials`.
- `parse-lecture-material`: after extracting the text, call a new `_shared/worksheetExtract.ts` (Gemini 3.8 Flash from `models.ts`). It detects a worksheet, splits the items, and fills in answers and choices (distractor rules apply), then saves the items.
- Materials UI: a worksheet toggle plus an editable item list.
- `useVoiceCommandDetection`: a new `send question N[part]` pattern that reads spoken numbers ("two" → 2) and keeps the 15s cooldown.
- `useWorksheetContext` hook: the pinned sheet for each session (saved locally), plus matching titles in the transcript to suggest a sheet.
- Dispatch: the client holds the send 5s for undo, then calls `format-and-send-question` with prebuilt content (no generation step), skipping On Deck.
- Tests: number/part parsing, the voice pattern, and item lookup misses.
