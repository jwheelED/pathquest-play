
# Fix Lecture Summary Generation

## Problem Analysis

The lecture summary feature has two main issues:

### Issue 1: Data Structure Mismatch

The Edge Function returns:
```text
{
  overallScore: 20,           // 0-100 scale
  topicsIdentified: [...],
  keyConceptsCovered: [...],
  engagementAnalysis: "...",
  teachingSuggestions: [...],
  conceptsToReview: [...],
  lectureHighlights: [...]
}
```

But `LectureSummarySheet.tsx` expects:
```text
{
  overallScore: number,
  summary: string,
  transcriptInsights: {
    avgPaceWPM: number,
    topicsCovered: string[],
    ...
  },
  studentInsights: {
    overallAccuracy: number,
    strugglingQuestions: [...],
    commonMisconceptions: [...],
    ...
  },
  recommendations: [...],
  reteachingSuggestions: [...]
}
```

When the component tries to access `summaryData.transcriptInsights.avgPaceWPM`, it crashes because `transcriptInsights` is undefined.

### Issue 2: User Wants Rating Removed

The "Overall Performance" card with the score display (e.g., "7/10 - Great") should be removed entirely.

---

## Solution

### Part 1: Update `LectureSummaryData` Interface

Align the TypeScript interface with what the Edge Function actually returns.

**File: `src/components/instructor/LectureSummarySheet.tsx`**

Replace the current interface (lines 32-50) with:

```typescript
export interface LectureSummaryData {
  topicsIdentified: string[];
  keyConceptsCovered: string[];
  engagementAnalysis: string;
  teachingSuggestions: string[];
  conceptsToReview: string[];
  lectureHighlights: string[];
  durationMinutes?: number;
  questionsAsked?: number;
  checkInResults?: {
    total: number;
    correct: number;
    accuracy: number;
  };
}
```

Note: `overallScore` and `summary` are intentionally removed.

### Part 2: Update Component UI

Remove the "Overall Performance" card and update other cards to use the correct data properties.

**Changes to make:**

| Section | Current Code | New Code |
|---------|--------------|----------|
| Overall Score Card | Lines 147-171 | **Remove entirely** |
| Topics Covered | `summaryData.transcriptInsights.topicsCovered` | `summaryData.topicsIdentified` |
| Speaking Pace Card | `summaryData.transcriptInsights.avgPaceWPM` | **Remove** (not returned by API) |
| Student Performance | `summaryData.studentInsights.overallAccuracy` | `summaryData.checkInResults?.accuracy` |
| Struggling Questions | `summaryData.studentInsights.strugglingQuestions` | **Remove** (not returned by API) |
| Common Misconceptions | `summaryData.studentInsights.commonMisconceptions` | **Remove** (not returned by API) |
| Recommendations | `summaryData.recommendations` | `summaryData.teachingSuggestions` |
| Re-teaching Suggestions | `summaryData.reteachingSuggestions` | `summaryData.conceptsToReview` (as simple strings) |

### Part 3: Simplified Component Structure

The new UI will display:

1. **Header Stats** - Duration, Questions Asked, Students (unchanged)
2. **Student Check-In Performance** - Shows accuracy from `checkInResults`
3. **Topics Covered** - From `topicsIdentified`
4. **Key Concepts** - From `keyConceptsCovered`
5. **Lecture Highlights** - From `lectureHighlights`
6. **Engagement Analysis** - From `engagementAnalysis`
7. **Teaching Suggestions** - From `teachingSuggestions`
8. **Concepts to Review** - From `conceptsToReview`

### Part 4: Remove Unused Helper Functions

Delete these functions that are no longer needed:
- `getScoreColor()` (lines 63-67)
- `getScoreLabel()` (lines 69-76)
- `getPaceStatus()` (lines 78-83)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/instructor/LectureSummarySheet.tsx` | Update interface, remove rating card, fix data property access |

---

## Technical Notes

- The Edge Function itself is working correctly (tested, returns 200 OK)
- No changes needed to the Edge Function
- No changes needed to `LectureTranscription.tsx` (already correctly passes the data)
- CORS headers were already fixed in the previous update

---

## After Implementation

The lecture summary sheet will:
1. Display correctly without crashing
2. Show all available insights from the AI analysis
3. Not show any "rating" or "score" for the lecture
