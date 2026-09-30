# Fix: transcript stops after Stop → Start recording in a live session

## Cause
When recording restarts, the recorder clears its list of transcript pieces (added earlier to stop old text from lingering). The piece that sends the transcript to students still remembers how many pieces it already sent (e.g. 40), so it ignores new ones until the fresh recording passes that count. Result: students and saved transcript see nothing after a restart.

A second issue: even once sending resumed, new pieces would reuse numbers already used (0, 1, 2...), so students' screens would drop them as duplicates.

## Fix (one file: `src/hooks/useLiveTranscriptBroadcast.ts`)
- Detect a restart: if the list of pieces gets shorter than what was already sent, treat it as a new recording.
- Keep a running offset so numbering continues (e.g. after 40 pieces, the next recording starts at 40), avoiding duplicates on student screens and in the saved transcript.
- Also reset when the list is emptied on Start, and only reset the offset when the session itself changes.
- On re-enable, re-subscribe the channel before sending (send attempts wait until the channel exists instead of being skipped).

No changes to recording, question detection, or grading.

## Verify
Start session → record → stop → record again; confirm the student "Live now" transcript keeps growing and numbering continues.
