import posthog from 'posthog-js';

// ============= Instructor Events =============

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

export const trackQuestionSent = (questionType: string, source: 'slide' | 'voice' | 'manual' | 'auto') => {
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

export const trackAutoQuestionTriggered = (intervalMinutes: number) => {
  posthog.capture('auto_question_triggered', {
    interval_minutes: intervalMinutes,
  });
};

export const trackSlidePresenterStarted = (presentationId: string) => {
  posthog.capture('slide_presentation_started', {
    presentation_id: presentationId,
  });
};

// ============= Student Events =============

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

export const trackClassJoined = (instructorId: string, courseId?: string) => {
  posthog.capture('class_joined', {
    instructor_id: instructorId,
    course_id: courseId,
  });
};

// ============= Error Tracking =============

export const trackError = (error: Error, context?: Record<string, any>) => {
  posthog.capture('$exception', {
    $exception_message: error.message,
    $exception_type: error.name,
    $exception_stack_trace_raw: error.stack,
    ...context,
  });
};

// ============= Page View Tracking =============

export const trackPageView = (pageName: string, properties?: Record<string, any>) => {
  posthog.capture('$pageview', {
    page_name: pageName,
    ...properties,
  });
};
