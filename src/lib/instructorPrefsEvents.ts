/**
 * Lightweight in-app broadcast so instructor preference changes (question
 * format, coding style) propagate immediately to every mounted consumer
 * without requiring a logout/login or page reload.
 */
export const INSTRUCTOR_PREFS_UPDATED = "instructor-prefs-updated";

export interface InstructorPrefsDetail {
  question_format_preference?: string;
  coding_question_style?: string;
}

export function emitInstructorPrefsUpdated(detail: InstructorPrefsDetail) {
  window.dispatchEvent(new CustomEvent<InstructorPrefsDetail>(INSTRUCTOR_PREFS_UPDATED, { detail }));
}

export function onInstructorPrefsUpdated(handler: (detail: InstructorPrefsDetail) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<InstructorPrefsDetail>).detail || {});
  window.addEventListener(INSTRUCTOR_PREFS_UPDATED, listener);
  return () => window.removeEventListener(INSTRUCTOR_PREFS_UPDATED, listener);
}
