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

// ============= Question Detection Telemetry =============

/** Detection filters that can discard a live question candidate. */
export type QuestionDetectionFilter =
  | 'low_confidence'
  | 'min_word_count'
  | 'max_word_count'
  | 'monologue'
  | 'rhetorical'
  | 'no_interrogative_trigger'
  | 'cooldown_block'
  | 'gate_hold'
  | 'empty_slice';

/** Where in the pipeline a question candidate came from. */
export type QuestionDetectionPath = 'trigger_capture' | 'passive' | 'manual';

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

/**
 * Mirrors detection telemetry into the browser console so the same "enhanced
 * feedback" that lands in PostHog is visible live in dev tools. PostHog's
 * console-log recording then captures these lines alongside the events.
 */
const logDetection = (label: string, payload: Record<string, unknown>) => {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.log(`📊 [posthog] ${label}`, payload);
};

/**
 * Fired whenever a live question candidate is discarded by a detection filter.
 * `filter` identifies which gate dropped it so detection thresholds can be
 * tuned against real classroom data instead of guesswork (audit FE-AP-2).
 */
export const trackQuestionDetectionDrop = (
  filter: QuestionDetectionFilter,
  details?: {
    text?: string;
    wordCount?: number;
    confidence?: number;
    path?: QuestionDetectionPath;
    reason?: string;
  },
) => {
  try {
    const payload = {
      filter,
      // Instructor speech (not student PII); truncate to keep events lean.
      text_snippet: details?.text?.slice(0, 80),
      word_count: details?.wordCount,
      confidence: details?.confidence,
      path: details?.path,
      reason: details?.reason,
    };
    posthog.capture('question_detection_drop', payload);
    logDetection(`question_detection_drop → ${filter}`, payload);
  } catch {
    // Telemetry must never break the detection path.
  }
};

/**
 * Fired when a question candidate survives every gate and reaches the on-deck
 * card. Pairs with `question_detection_drop` so pickup rate is measurable.
 */
export const trackQuestionDetected = (
  path: QuestionDetectionPath,
  details?: {
    text?: string;
    wordCount?: number;
    confidence?: number;
    latencyMs?: number;
    contextChars?: number;
  },
) => {
  try {
    const payload = {
      path,
      text_snippet: details?.text?.slice(0, 80),
      word_count: details?.wordCount,
      confidence: details?.confidence,
      latency_ms: details?.latencyMs,
      context_chars: details?.contextChars,
    };
    posthog.capture('question_detected', payload);
    logDetection(`question_detected ← ${path}`, payload);
  } catch {
    // Telemetry must never break the detection path.
  }
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
