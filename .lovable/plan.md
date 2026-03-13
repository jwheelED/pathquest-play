
## Plan: Passive Question Detection from Deepgram Punctuation

**STATUS: COMPLETED**

Implemented passive question detection that monitors `is_final` transcript utterances for question marks (`?`) from Deepgram's smart formatting. When the speaker naturally asks a substantive question (8+ words, not rhetorical), a floating candidate card appears for the instructor to send or dismiss. Auto-dismisses after 15 seconds with a 30-second cooldown between detections.

### Files Created
- `src/hooks/usePassiveQuestionDetection.ts` — Core detection hook with filtering, cooldown, and rhetorical blocklist
- `src/components/instructor/PassiveQuestionCandidate.tsx` — Floating card UI with countdown progress bar

### Files Edited
- `src/components/instructor/LectureTranscription.tsx` — Wired hook into onTranscript callback, added "Detect questions" toggle, rendered candidate card
- `src/hooks/useLectureRecording.ts` — Wired hook into Deepgram streaming callback, exposed passive detection state in return
