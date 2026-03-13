

## Plan: Live Copilot Redesign — Always-On Autodraft Command Center

This is a major UI/UX overhaul of the Live Session tab, transforming it from a manual "lecture capture" tool into a premium, always-on **Live Copilot** that continuously autodrafts audience checks and provides room-level insight after sending.

### Current State
- `LectureTranscription.tsx` (3,769 lines) handles recording, transcript display, voice commands, passive detection, auto-question timers, system status, and question sending — all in one massive component
- Results live in `LiveSessionResults.tsx` and `LectureCheckInResults.tsx` with correctness-dominant stats
- `VoiceQuestionPreviewDialog.tsx` is a form-builder-style dialog for editing questions before sending
- The passive detection card (`PassiveQuestionCandidate.tsx`) is a small floating toast

### What Changes

#### 1. Rename & Rebrand Throughout
| Current | New |
|---|---|
| "Live Lecture Capture" | **Live Copilot** |
| "Voice Question Preview" dialog | **Review Audience Check** |
| "Check-In Results" | **Live Room Insight** |
| "Visual Analytics" / charts | **Room Signal** |
| "Send Question" button | **Send Now** |
| "Detect questions" toggle | Remove — always on |
| Tab label "Live Session" | **Live Copilot** |

#### 2. New: Persistent "Question on Deck" Card (Central Artifact)
**New component: `src/components/instructor/QuestionOnDeck.tsx`**

A prominent, always-visible card in the center of the Live tab that replaces the passive detection toast and the manual "Send Question" button:

- **Always shows the current autodrafted audience check** — initially empty with a calm "Listening..." state, then populates as Edvana detects a question from the transcript
- **Updates live**: as the speaker continues talking, the card refines the draft (replaces previous candidate)
- **Shows**: question text, recommended format badge (MCQ / Short Answer), confidence indicator
- **Actions row**: `Preview` (opens Review Audience Check modal), `Send Now` (instant send), `Hold` (pins current draft, prevents auto-update), `Edit` (inline edit mode)
- **Source**: Combines passive detection (question marks) + auto-interval drafts into a single unified "on deck" pipeline
- Replaces the floating `PassiveQuestionCandidateCard` toast entirely

#### 3. Restructure Live Tab Layout
**Edit: `src/pages/InstructorDashboard.tsx` + `src/components/instructor/LectureTranscription.tsx`**

New layout order when recording is active:

```text
┌──────────────────────────────────────┐
│  Live Copilot Header                 │
│  [Start/Stop] [9 students] [12:34]   │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │  QUESTION ON DECK (prominent)  │  │
│  │  "What is the derivative..."   │  │
│  │  [MCQ badge]  confidence: high │  │
│  │                                │  │
│  │  [Preview] [Send Now] [Hold]   │  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│  Live Room Insight (results)         │
│  - Room Signal interpretation        │
│  - Recommended Next Move             │
├──────────────────────────────────────┤
│  ▸ Live Session Feed (collapsed)     │
│    transcript chunks, system status  │
└──────────────────────────────────────┘
```

- Move transcript chunks, system status grid, error history, auto-question debug dashboard into a collapsible **"Live Session Feed"** section at the bottom
- The recording controls (start/stop, duration, student count) stay at the top but become a slim status bar

#### 4. Redesign "Review Audience Check" Modal
**Edit: `src/components/instructor/VoiceQuestionPreviewDialog.tsx`**

- Rename title from "Voice Question Preview" → **"Review Audience Check"**
- Remove form-builder feel: hide raw MCQ option inputs behind an "Edit Options" toggle
- Lead with the question text prominently displayed, recommended format as a pill, and a clean `Send Now` CTA
- Add a subtle "Source context" collapsible showing the transcript snippet (currently `sourceTranscript`)
- Rename "Confirm & Send" → **"Send to Room"**

#### 5. Redesign Results: Live Room Insight + Room Signal
**Edit: `src/components/instructor/LiveSessionResults.tsx` + `src/components/instructor/LectureCheckInResults.tsx`**

- Rename card titles: "Check-In Results" → **"Live Room Insight"**, chart sections → **"Room Signal"**
- **Lead with interpretation** instead of raw correctness stats:
  - Replace "X/Y correct (Z%)" dominance with a natural language summary line: e.g., "Most of the room got this — ready to move on" or "Split room — consider revisiting this concept"
  - Add a **"Recommended Next Move"** badge/line below each question result (e.g., "Move on", "Revisit", "Discuss")
- Keep correctness data available but secondary (smaller text, collapsed detail)
- Reduce visual weight of red/green correct/incorrect icons

#### 6. Unify Detection Pipeline
**Edit: `src/hooks/usePassiveQuestionDetection.ts` + `src/components/instructor/LectureTranscription.tsx`**

- Remove the separate passive detection toggle — detection is always on when recording
- Route all detected questions (passive punctuation + auto-interval) into the single "Question on Deck" card state
- When a new candidate arrives, it replaces the current on-deck draft (unless "Hold" is active)
- Fix the rhetorical detection issue: "How's everyone doing today?" should be blocked — add common greeting patterns to the blocklist

### Files Summary

| Action | File | What |
|---|---|---|
| **Create** | `src/components/instructor/QuestionOnDeck.tsx` | Central autodraft card |
| **Edit** | `src/pages/InstructorDashboard.tsx` | Rename tab, restructure layout |
| **Edit** | `src/components/instructor/LectureTranscription.tsx` | Rebrand, restructure sections, unify pipeline, remove passive toggle |
| **Edit** | `src/components/instructor/VoiceQuestionPreviewDialog.tsx` | Rename + redesign as Review Audience Check |
| **Edit** | `src/components/instructor/LiveSessionResults.tsx` | Rename + add interpretation layer |
| **Edit** | `src/components/instructor/LectureCheckInResults.tsx` | Rename + add Room Signal + Next Move |
| **Edit** | `src/hooks/usePassiveQuestionDetection.ts` | Always-on, fix greeting detection |
| **Delete** | `src/components/instructor/PassiveQuestionCandidate.tsx` | Replaced by QuestionOnDeck |

### Scope Note
This is a large redesign touching 7-8 files. I recommend implementing it in 2-3 rounds:
1. **Round 1**: QuestionOnDeck card + Live tab restructure + rebranding
2. **Round 2**: Results redesign (Room Insight + Room Signal + Next Move)
3. **Round 3**: Review Audience Check modal polish + greeting blocklist fix

