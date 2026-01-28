

# Add "View Poll Results" Button to Slide Presenter Overlay

## Overview

Modify the Slide Presenter overlay so that poll/MCQ results are hidden by default behind a "View Poll" button, while response counts remain visible at all times.

## Current Behavior

When an MCQ/poll has responses:
- The full bar chart (`MCQDistributionChart`) shows automatically
- Response count is embedded within the chart footer

## Desired Behavior

When an MCQ/poll has responses:
- Show a compact "Responses" indicator with count (e.g., "12/25 responses")
- Show a "View Poll" button
- When clicked, reveal the full distribution chart
- Option to hide it again

---

## Implementation Plan

### File: `src/components/instructor/slides/SlidePresenterOverlay.tsx`

**1. Add new state for chart visibility:**

```typescript
const [showPollResults, setShowPollResults] = useState(false);
```

**2. Reset visibility when a new question arrives:**

```typescript
// Reset poll results visibility when question changes
useEffect(() => {
  setShowPollResults(false);
}, [currentQuestion?.timestamp]);
```

**3. Replace the auto-showing MCQ chart section with a conditional UI:**

**Current (lines 225-241):**
```typescript
{isMCQ && mcqDistribution && currentStats && currentStats.responseCount > 0 && (
  <div className="bg-slate-800/50 rounded-lg p-3">
    {/* Always shows chart */}
    <MCQDistributionChart ... />
  </div>
)}
```

**New structure:**
```typescript
{isMCQ && mcqDistribution && currentStats && currentStats.responseCount > 0 && (
  <div className="bg-slate-800/50 rounded-lg p-3">
    {/* Always visible: Response count + View Poll button */}
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs text-slate-300">
          <span className="font-bold">{currentStats.responseCount}</span>
          <span className="text-slate-500">/{studentCount} responses</span>
        </span>
      </div>
      <button
        onClick={() => setShowPollResults(!showPollResults)}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium 
                   bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
      >
        <BarChart3 className="w-3 h-3" />
        {showPollResults ? 'Hide' : 'View Poll'}
      </button>
    </div>
    
    {/* Conditionally visible: Full chart */}
    {showPollResults && (
      <MCQDistributionChart
        distribution={mcqDistribution}
        isPoll={isPoll}
        totalResponses={currentStats.responseCount}
        totalStudents={studentCount}
      />
    )}
  </div>
)}
```

**4. Update minimized view to include response indicator:**

In the minimized pill (around line 146-154), keep showing response count but not the percentage:

```typescript
{currentStats && currentStats.responseCount > 0 && (
  <span className="text-xs text-blue-400 font-medium">
    {currentStats.responseCount} responses
  </span>
)}
```

---

## Visual Summary

### Before:
```
┌─────────────────────────────┐
│ Poll Results                │
│ ┌───┬────────────────┬────┐ │
│ │ A │████████████    │ 12 │ │  ← Auto-shows
│ │ B │██████          │  6 │ │
│ │ C │████            │  4 │ │
│ │ D │██              │  2 │ │
│ └───┴────────────────┴────┘ │
│ 24/45 responses             │
└─────────────────────────────┘
```

### After:
```
┌─────────────────────────────┐
│ 👤 24/45 responses  [View Poll] │  ← Always visible
└─────────────────────────────┘

         ↓ Click "View Poll" ↓

┌─────────────────────────────┐
│ 👤 24/45 responses  [ Hide ]│
│ ┌───┬────────────────┬────┐ │
│ │ A │████████████    │ 12 │ │  ← Now visible
│ │ B │██████          │  6 │ │
│ │ C │████            │  4 │ │
│ │ D │██              │  2 │ │
│ └───┴────────────────┴────┘ │
└─────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/instructor/slides/SlidePresenterOverlay.tsx` | Add `showPollResults` state, conditional chart visibility, "View Poll" button |

---

## Behavior Summary

| Element | Before | After |
|---------|--------|-------|
| Response count | Visible in chart footer | Always visible at top |
| Distribution bars | Auto-shows | Hidden until button clicked |
| "View Poll" button | N/A | New - toggles chart visibility |
| New question arrives | Chart shows immediately | Chart hidden, button visible |

