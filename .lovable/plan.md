

## Plan: Redesign Corporate Events as a Speaker-Focused Live Session Dashboard

### Concept

Replace the current event-management dashboard with a **speaker control center** — mirroring the instructor's live session workflow but tailored for event speakers (TED talks, conferences, workshops). Speakers use Edvana's live capture on their device; attendees join via session code on their phones.

### Page Structure (`src/pages/CorporateEvents.tsx` — full rewrite)

Reuse `DashboardShell` layout with sidebar nav, same pattern as `InstructorDashboard.tsx`.

**Sidebar Tabs:**
- **Overview** — Speaker's home: quick-start module, past sessions summary, key metrics
- **Live Session** — Start/manage a live session with join code, live capture (transcription), and real-time results
- **Past Sessions** — History of completed sessions with response data
- **Settings** — Speaker profile, preferences

### Tab Details

#### 1. Overview
- **Quick Start Module**: Prominent "Start Live Session" card with title input + "Go Live" button (reuses `LiveSessionControls` pattern but simplified — no course selector needed)
- **Metrics Row** (3 cards): Total Sessions, Total Participants, Avg Engagement Rate (mock data)
- **Recent Sessions list**: Last 3 sessions with title, date, participant count, status

#### 2. Live Session
- **Session Controls**: Start/end session, display join code, QR code, copy link — mirrors `LiveSessionControls` component logic but uses local state (no Supabase auth required for now, mock flow)
- **Live Capture placeholder**: Card explaining "Live transcription captures your talk in real-time and generates understanding checks for your audience" with a simulated status indicator
- **Live Results placeholder**: Card showing mock response summary (X responses, Y% correct, avg response time) — mirrors `PresenterStatsBar` layout

#### 3. Past Sessions
- **Table**: Session Title, Date, Participants, Questions Sent, Avg Score, Actions (View Details)
- Mock data with 3-4 past sessions
- Clicking "View Details" shows an expanded card with per-question breakdown (mock)

#### 4. Settings
- Speaker name, email (text inputs, local state)
- Default session format preference (select)
- Notification preferences (switches)

### Technical Approach

- **Single file rewrite** of `src/pages/CorporateEvents.tsx` (~500 lines)
- Uses `DashboardShell` for consistent layout with the instructor dashboard
- All data is local state + mock data (no Supabase calls) — ready for backend wiring later
- Reuses existing UI components: `Card`, `Button`, `Input`, `Badge`, `Table`, `Dialog`, `Switch`, `Select`
- No new files, routes, or dependencies needed

### Key Differences from Instructor Dashboard

| Aspect | Instructor | Events Speaker |
|--------|-----------|----------------|
| Auth | Supabase auth required | No auth (mock/local) |
| Course context | Course selector | No courses — standalone sessions |
| Tabs | 8 tabs (overview, live, recorded, QB, etc.) | 4 tabs (overview, live, past, settings) |
| Live capture | Deepgram transcription | Placeholder card (same concept, not wired) |
| Terminology | "Students", "Lecture" | "Attendees/Audience", "Talk/Session" |

