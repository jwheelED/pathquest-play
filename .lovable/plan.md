
# Persist Recording Across Instructor Dashboard Tabs

## Problem
When an instructor starts recording in the "Live Lecture" tab and navigates to another tab (Overview, Materials, etc.), the recording stops because the `LectureTranscription` component unmounts.

## Root Cause
In `InstructorDashboard.tsx`, the tab content is rendered using a switch statement in `renderTabContent()`. When `activeTab !== "live"`, the `LectureTranscription` component is not rendered, causing it to unmount. React cleanup effects then stop all recording resources (MediaRecorder, Deepgram WebSocket, timers).

## Solution: Always Mount LectureTranscription

The simplest and most reliable solution is to **always render** the `LectureTranscription` component, but only **show it** when on the Live Lecture tab. This keeps all recording state alive while the instructor navigates between tabs.

### Implementation

**File: `src/pages/InstructorDashboard.tsx`**

#### Change 1: Extract LectureTranscription from tab switch (around line 461-499)

Move `LectureTranscription` outside of `renderTabContent()` so it's always mounted:

```typescript
// Before the return statement, add a flag for visibility
const isLiveTabActive = activeTab === "live";
```

#### Change 2: Render LectureTranscription outside tabs with conditional visibility

In the main JSX, render `LectureTranscription` unconditionally but with visibility control:

```typescript
{/* Always mount LectureTranscription to persist recording across tabs */}
<div className={cn("min-w-0", !isLiveTabActive && "hidden")}>
  <LectureTranscription onQuestionGenerated={() => {}} />
</div>
```

#### Change 3: Update renderTabContent for "live" tab

Remove `LectureTranscription` from inside the `case "live":` block since it's now rendered separately:

```typescript
case "live":
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {currentUser && (
          <div className="min-w-0">
            <LiveSessionControls onSessionChange={setLiveSessionId} />
          </div>
        )}

        <Card className="headspace-card border-primary/20 ...">
          {/* Slide Presenter card - unchanged */}
        </Card>
      </div>

      {/* LectureTranscription removed - now rendered outside tabs */}
      
      <div className="min-w-0">
        <LectureCheckInResults />
      </div>
    </div>
  );
```

### Visual Layout

```text
┌──────────────────────────────────────────────────────────────┐
│  InstructorDashboard                                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Tab Bar: [Overview] [Live Lecture] [Recorded] [...]   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  LectureTranscription (always mounted)                 │  │
│  │  - Visible when activeTab === "live"                   │  │
│  │  - Hidden but RUNNING when on other tabs               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  renderTabContent() - other tab content                │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### User Experience Improvements

**Add Recording Indicator Badge**

Show a visual indicator in the tab bar when recording is active but user is on a different tab:

```typescript
// In navItems rendering, add badge for live tab when recording
{navItems.map(({ value, label, icon: Icon }) => (
  <button
    key={value}
    onClick={() => setActiveTab(value)}
    className={cn(...)}
  >
    <Icon className="w-4 h-4" />
    {label}
    {value === "live" && isRecordingActive && activeTab !== "live" && (
      <Badge variant="destructive" className="ml-1 animate-pulse">
        REC
      </Badge>
    )}
  </button>
))}
```

This requires lifting `isRecording` state from `LectureTranscription` to the dashboard level, OR using a ref/callback to communicate recording status.

## Technical Details

### Why CSS `hidden` Works
- Using `hidden` (Tailwind's `display: none`) preserves the component in the React tree
- All refs, state, and effects remain active
- MediaRecorder continues capturing audio
- Deepgram WebSocket stays connected
- Timers (auto-question countdown) keep running
- Student count updates continue via Realtime

### Alternative Considered: Lift State with useLectureRecording
This would involve using the `useLectureRecording` hook directly in `InstructorDashboard` and passing all necessary props/callbacks to `LectureTranscription`. While more architecturally "clean," it requires:
- Significant refactoring of `LectureTranscription` to accept recording state as props
- Moving ~50 state variables and refs up to the dashboard
- Breaking the current encapsulation of recording logic

The "always mount with hidden" approach achieves the same result with minimal code changes.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/InstructorDashboard.tsx` | Move `LectureTranscription` outside tab switch, control visibility with `hidden` class |

## Expected Behavior After Fix

1. Instructor goes to Live Lecture tab and starts recording
2. Recording indicator shows, Deepgram streaming begins
3. Instructor clicks "Overview" tab to check class code
4. **Recording continues in background** (previously stopped)
5. Tab bar shows "REC" badge on Live Lecture tab (optional enhancement)
6. Instructor returns to Live Lecture tab - recording still active, transcript preserved
7. Auto-question timers, voice commands, and student counts all continue working seamlessly
