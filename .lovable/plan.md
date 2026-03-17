
## Plan: Live Copilot Redesign — Always-On Autodraft Command Center

**STATUS: ROUND 1-3 COMPLETE**

### What was implemented

#### Round 1: QuestionOnDeck + Live tab restructure + rebranding
- Created `QuestionOnDeck.tsx` — persistent autodraft card with Listening/Draft states, Preview/Send Now/Hold/Edit actions
- Rebranded "Live Lecture Capture" → **Live Copilot** throughout
- Rebranded "Live Session" tab → **Live Copilot**
- Removed "Detect questions" toggle — detection is now always on
- Wrapped transcript chunks in collapsible **Live Session Feed**
- Replaced floating `PassiveQuestionCandidateCard` toast with inline QuestionOnDeck card

#### Round 2: Results redesign (Room Insight + Room Signal + Next Move)
- Renamed "Check-In Results" → **Live Room Insight** in LectureCheckInResults
- Renamed "Live Session Responses" → **Live Room Insight** in LiveSessionResults
- Renamed "Visual Analytics" → **Room Signal** in LectureCheckInResults
- Added `getRoomSignal()` interpretation function (Move on / Solid / Split room / Revisit)
- Each live question result now leads with natural language interpretation + "Recommended Next Move" badge
- Correctness stats are secondary (smaller text in interpretation section)

#### Round 3: Review modal + greeting fix
- Renamed "Voice Question Preview" → **Review Audience Check** in VoiceQuestionPreviewDialog
- Renamed "Send to Students" → **Send to Room**
- Added greeting pattern detection (`GREETING_PATTERNS`) to `usePassiveQuestionDetection.ts`
- "How's everyone doing today?" and similar greetings are now blocked before WH-question bypass
- Auto-dismiss extended to 60s for persistent on-deck card

### Files Created
- `src/components/instructor/QuestionOnDeck.tsx` — Central autodraft card

### Files Edited
- `src/pages/InstructorDashboard.tsx` — Tab rename
- `src/components/instructor/LectureTranscription.tsx` — Rebrand, layout restructure, unified pipeline
- `src/components/instructor/VoiceQuestionPreviewDialog.tsx` — Rename + Send to Room
- `src/components/instructor/LiveSessionResults.tsx` — Room Insight + interpretation layer
- `src/components/instructor/LectureCheckInResults.tsx` — Room Insight + Room Signal
- `src/hooks/usePassiveQuestionDetection.ts` — Greeting patterns, always-on
- `src/hooks/useLectureRecording.ts` — Always-on detection config

### Files No Longer Used
- `src/components/instructor/PassiveQuestionCandidate.tsx` — Replaced by QuestionOnDeck (not deleted, no longer imported)
