
# PostHog Full Integration Plan

## Overview
This plan adds comprehensive PostHog analytics integration to the Edvana application, including user identification, custom event tracking, and error tracking. The implementation will link authenticated users to their PostHog activity and track key business events.

---

## Implementation Summary

### Phase 1: User Identification (Core)
Add an auth state listener in `App.tsx` that identifies users when they log in and resets when they log out.

### Phase 2: Custom Event Tracking
Add tracking calls to key user actions across the application.

### Phase 3: Error Tracking
Set up global error boundary and unhandled error capture.

---

## Detailed Changes

### 1. User Identification in App.tsx

Convert `App` from an arrow function to a function component with a `useEffect` that:
- Listens to `supabase.auth.onAuthStateChange`
- Calls `posthog.identify(userId, { email })` on login
- Calls `posthog.reset()` on logout

```text
File: src/App.tsx

Changes:
- Add imports: useEffect from react, posthog from posthog-js, supabase client
- Convert to function component format
- Add useEffect with auth listener
```

### 2. Instructor Event Tracking

Track these key instructor actions:

| Event Name | Location | Trigger |
|------------|----------|---------|
| `live_session_started` | LiveSessionControls.tsx | Session created successfully |
| `live_session_ended` | LiveSessionControls.tsx | Session ended |
| `question_sent` | SlidePresenter.tsx | Question confirmed and sent |
| `auto_question_triggered` | useLectureRecording.ts | Auto-question generated |
| `recording_started` | useLectureRecording.ts | Lecture recording begins |
| `recording_stopped` | useLectureRecording.ts | Lecture recording ends |
| `slide_presentation_started` | SlidePresenter.tsx | Presentation launched |

### 3. Student Event Tracking

Track these student actions:

| Event Name | Location | Trigger |
|------------|----------|---------|
| `live_session_joined` | JoinLive.tsx | Student joins with code |
| `question_answered` | LiveStudent.tsx | Response submitted |
| `class_joined` | StudentTraining.tsx | Joined an instructor's class |

### 4. Error Tracking Setup

Create a new error tracking utility that:
- Captures unhandled errors via `window.onerror`
- Captures unhandled promise rejections
- Reports to PostHog with `posthog.capture('$exception', {...})`

---

## Files to Create/Modify

### New Files
1. **`src/lib/posthogTracking.ts`** - Centralized tracking helper functions
2. **`src/components/ErrorBoundary.tsx`** - React error boundary for component errors

### Modified Files
1. **`src/App.tsx`** - Add user identification + error boundary wrapper
2. **`src/components/instructor/LiveSessionControls.tsx`** - Track session start/end
3. **`src/pages/SlidePresenter.tsx`** - Track question sends
4. **`src/hooks/useLectureRecording.ts`** - Track recording + auto-questions
5. **`src/pages/JoinLive.tsx`** - Track student join
6. **`src/pages/LiveStudent.tsx`** - Track answer submission
7. **`src/main.tsx`** - Initialize error listeners

---

## Technical Details

### PostHog Tracking Utility (src/lib/posthogTracking.ts)

```typescript
import posthog from 'posthog-js';

// Instructor events
export const trackSessionStarted = (sessionCode: string, courseId: string) => {
  posthog.capture('live_session_started', {
    session_code: sessionCode,
    course_id: courseId,
  });
};

export const trackSessionEnded = (sessionCode: string, participantCount: number) => {
  posthog.capture('live_session_ended', {
    session_code: sessionCode,
    participant_count: participantCount,
  });
};

export const trackQuestionSent = (questionType: string, source: 'slide' | 'voice' | 'manual') => {
  posthog.capture('question_sent', {
    question_type: questionType,
    source: source,
  });
};

export const trackRecordingStarted = () => {
  posthog.capture('recording_started');
};

export const trackRecordingEnded = (durationSeconds: number) => {
  posthog.capture('recording_ended', {
    duration_seconds: durationSeconds,
  });
};

// Student events
export const trackSessionJoined = (sessionCode: string, nickname: string) => {
  posthog.capture('live_session_joined', {
    session_code: sessionCode,
    nickname: nickname,
  });
};

export const trackQuestionAnswered = (questionType: string, responseTimeMs: number) => {
  posthog.capture('question_answered', {
    question_type: questionType,
    response_time_ms: responseTimeMs,
  });
};

// Error tracking
export const trackError = (error: Error, context?: Record<string, any>) => {
  posthog.capture('$exception', {
    $exception_message: error.message,
    $exception_type: error.name,
    $exception_stack_trace_raw: error.stack,
    ...context,
  });
};
```

### User Identification in App.tsx

```typescript
import { useEffect } from "react";
import posthog from "posthog-js";
import { supabase } from "@/integrations/supabase/client";

function App() {
  // PostHog user identification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // Identify user in PostHog
          posthog.identify(session.user.id, {
            email: session.user.email,
            role: session.user.user_metadata?.role,
          });
        } else if (event === 'SIGNED_OUT') {
          // Clear PostHog data on logout
          posthog.reset();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    // ... existing JSX ...
  );
}
```

### Error Boundary Component

Creates a React ErrorBoundary that:
- Catches render errors in child components
- Reports to PostHog
- Shows a fallback UI
- Wraps the main `<BrowserRouter>` in App.tsx

### Global Error Handlers in main.tsx

```typescript
import posthog from 'posthog-js';

// Global unhandled error capture
window.onerror = (message, source, lineno, colno, error) => {
  posthog.capture('$exception', {
    $exception_message: String(message),
    $exception_source: source,
    $exception_lineno: lineno,
    $exception_colno: colno,
    $exception_stack_trace_raw: error?.stack,
  });
};

// Unhandled promise rejection
window.onunhandledrejection = (event) => {
  posthog.capture('$exception', {
    $exception_message: event.reason?.message || String(event.reason),
    $exception_type: 'UnhandledPromiseRejection',
    $exception_stack_trace_raw: event.reason?.stack,
  });
};
```

---

## Event Properties Summary

All events will automatically include PostHog's default properties (page URL, device, browser, etc). Custom properties added:

| Event | Properties |
|-------|------------|
| `live_session_started` | session_code, course_id |
| `live_session_ended` | session_code, participant_count |
| `question_sent` | question_type, source |
| `recording_started` | (none) |
| `recording_ended` | duration_seconds |
| `live_session_joined` | session_code, nickname |
| `question_answered` | question_type, response_time_ms |
| `$exception` | message, type, stack_trace, context |

---

## Benefits

1. **User Identification**: See "Jonathan clicked X" instead of anonymous user IDs
2. **Instructor Insights**: Track session frequency, question volume, recording duration
3. **Student Engagement**: Track join rates, answer submission times
4. **Error Visibility**: Catch and report JavaScript errors automatically
5. **Funnel Analysis**: Create conversion funnels from session start to question delivery
