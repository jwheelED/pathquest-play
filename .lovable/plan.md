
# Fix: "Back to Dashboard" Button Blocked by Expanded Accordion

## Problem Summary
On the Class Dashboard (`/class/:instructorId`), when a student expands a live lecture check-in question in the `AssignedContent` component, clicking the "Back to Dashboard" button in the header does not navigate until the question is collapsed.

## Root Cause Analysis
The `AssignedContent` component uses a Radix UI `Accordion` component which:
1. Captures focus when expanded
2. Has event handlers that may intercept click events
3. Uses animation classes that could affect layout/z-index during transitions

The issue is that clicks on the header button are being intercepted or focus is trapped within the accordion.

## Solution

### Option A: Stop propagation on AccordionContent (Recommended)
Add `onClick={(e) => e.stopPropagation()}` to prevent click events inside the accordion from bubbling up and potentially interfering with navigation.

**File**: `src/components/student/AssignedContent.tsx` (line ~1296)

```typescript
<AccordionContent>
  <div 
    className="space-y-4 pt-2"
    onClick={(e) => e.stopPropagation()}
  >
    // ... existing content
```

### Option B: Increase header z-index
Ensure the header is always above any accordion content by using a higher z-index.

**File**: `src/pages/ClassDashboard.tsx` (line 133)

Change:
```typescript
<header className="hidden md:block bg-card/80 backdrop-blur-sm shadow-sm sticky top-0 z-40">
```

To:
```typescript
<header className="hidden md:block bg-card/80 backdrop-blur-sm shadow-sm sticky top-0 z-50">
```

### Option C: Add explicit pointer-events to header (Belt and suspenders)
Ensure the header button always receives pointer events.

**File**: `src/pages/ClassDashboard.tsx` (line 137-145)

```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={(e) => {
    e.stopPropagation();
    navigate("/dashboard");
  }}
  className="gap-2 rounded-full hover:bg-accent pointer-events-auto relative z-10"
>
```

## Recommended Implementation
Apply **both Option A and Option C** for a robust fix:

1. In `AssignedContent.tsx`: Add `onClick={(e) => e.stopPropagation()}` to the AccordionContent wrapper div
2. In `ClassDashboard.tsx`: Add `e.stopPropagation()` to the Back button's onClick handler

## Files to Modify

| File | Change |
|------|--------|
| `src/components/student/AssignedContent.tsx` | Add `onClick={(e) => e.stopPropagation()}` to AccordionContent inner div |
| `src/pages/ClassDashboard.tsx` | Add `e.stopPropagation()` to Back button onClick |

## Technical Details

The Radix UI Accordion uses focus management and event handling for accessibility. When expanded, keyboard events and potentially mouse events are captured to manage the accordion state. By stopping propagation explicitly, we ensure that:

1. Events inside the accordion content don't bubble up unnecessarily
2. The header button's click handler runs without interference

This is a minimal, targeted fix that doesn't change the accordion's functionality but prevents it from interfering with navigation elements outside its scope.
