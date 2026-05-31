// Canonical question-detection module.
//
// Imported by BOTH the client hook (`src/hooks/usePassiveQuestionDetection.ts`)
// and the server function (`supabase/functions/detect-speaker-questions/`).
// Keep this file free of Deno-, browser-, or React-specific imports so it
// stays portable.

export const RHETORICAL_BLOCKLIST = [
  'right',
  'okay',
  'ok',
  'understand',
  'got it',
  'you know',
  'see what i mean',
  "isn't it",
  "aren't they",
  "don't you think",
  'does that make sense',
  'make sense',
  'make sense to you',
  'with me so far',
  'any questions',
  'everyone with me',
  'following along',
  'clear',
  'is that clear',
  'yes',
  'no',
  'huh',
  'correct',
  'true',
  "isn't that right",
  'see',
  'you see',
  'you get it',
  'you follow',
  'shall we',
  'shall i',
  'ready',
  'are we good',
  'good so far',
  'sound good',
  'sounds good',
  'know what i mean',
  'fair enough',
  'yeah',
  'everyone got that',
  'all good',
  'is it not',
  "wouldn't you say",
  'can you see',
  'can everyone see',
  'can you hear me',
  'can everyone hear me',
  'what do you think',
  'what do you guys think',
  'what do you all think',
  'what do you say',
  'what say you',
  'how about that',
  'how does that sound',
  'how about',
  'how so',
  'where were we',
  'where was i',
  'what was i saying',
  'where was i going',
  'who knows',
  'who can tell me',
  'who would have thought',
  'what just happened',
  'what about that',
  'what about it',
  'what would you do',
  'what would you say',
  'how are we doing',
  'how are you doing',
  'how is everyone doing',
  'how is everybody doing',
  'how are we looking',
];

export const GREETING_PATTERNS = [
  /^how('?s| is) everyone/i,
  /^how('?s| is) everybody/i,
  /^how('?s| are) (you|y'all|ya'll|yall) (all )?(doing|today|this|feeling)/i,
  /^how are (we|you|you guys|y'all|everyone|everybody) (doing|today|this|feeling)/i,
  /^how('?s| is) it going/i,
  /^what('?s| is) up/i,
  /^how('?s| is| are) (your|the) (day|morning|afternoon|evening)/i,
  /^how('?s| is| are) (you|everyone|everybody|you guys) feeling/i,
  /^(good )?(morning|afternoon|evening|hey|hello|hi|welcome)/i,
  /^(is )?everyone (here|ready|good|doing)/i,
  /^(are )?we (all )?(here|ready|good|set)/i,
  /^can (you|everyone|everybody) hear me/i,
  /^can (you|everyone|everybody) see (me|this|the screen|my screen)/i,
];

// Specific high-precision interrogative forms.
export const TRIGGER_PATTERNS = [
  /\bwhat\s+(is|are|was|were|do|does|did|would|could|should|about|happens|happened|causes|type|kind|percentage|number|part|if|makes|caused)\b/i,
  /\bwhy\s+(is|are|do|does|did|would|can|could|should|might|don'?t|doesn'?t|didn'?t)\b/i,
  /\bhow\s+(many|much|do|does|did|is|are|would|could|can|should|long|often|far|come|might)\b/i,
  /\bwhen\s+(is|are|do|does|did|would|was|were|can|should|will|might)\b/i,
  /\bwhere\s+(is|are|do|does|did|would|was|were|can|will|might)\b/i,
  /\bwho\s+(is|are|was|were|does|did|would|can|could|should|discovered|invented|proposed|made|wrote|said)\b/i,
  /\bwhich\s+(one|of|is|are|type|kind|part|organ|bone|cell|structure|process|method|step|stage|phase|option|choice)\b/i,
  /\btell\s+me\s+(what|why|how|when|where|who|which|about|if)\b/i,
  /\b(anyone|anybody|someone|somebody)\s+(know|tell|explain|guess|say|remember|recall)\b/i,
  /\b(can|could|would)\s+(someone|anyone|anybody|somebody)\s+(tell|explain|describe|say|name|identify|guess)\b/i,
  /\bdo\s+you\s+(know|think|see|understand|remember|recall|recognize)\b/i,
  /\bwhat\s+would\s+happen\b/i,
  /\bsuppose\s+that\b/i,
];

// Leading filler that may sit between the clause start and the WH-word
// ("So why…", "And how…"). Stripped before trigger checks so an instructor
// who introduces a question with a discourse marker still triggers detection.
export const FILLER_PREFIXES = /^(so+|um+|uh+|well|okay so|okay|ok|now)[\s,]+/i;

export function stripLeadingFiller(text: string): string {
  let out = text.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(FILLER_PREFIXES, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

// Permissive fallback: any interrogative-led sentence with a verb-shaped token
// after it qualifies. Anchored to the START of the trimmed text so a mid-
// sentence WH-word inside a declarative ("…and how dangerous components can
// be…") does not falsely match. Rhetorical phrases are still filtered out
// separately via the blocklist.
export const FALLBACK_INTERROGATIVE_PATTERN =
  /^(what|why|how|when|where|who|whom|whose|which)\b\s+\S+/i;

/** Lower bound on question length, in words. Shared by client + server. */
export const MIN_WORD_COUNT = 4;

export function hasInterrogativeTrigger(text: string): boolean {
  const stripped = stripLeadingFiller(text);
  if (TRIGGER_PATTERNS.some((p) => p.test(text) || p.test(stripped))) return true;
  return (
    FALLBACK_INTERROGATIVE_PATTERN.test(text.trim()) ||
    FALLBACK_INTERROGATIVE_PATTERN.test(stripped)
  );
}

export function extractQuestions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?') && !normalized.includes('？')) return [];

  const sentences = normalized.split(/[.!;:]\s+/);
  const questions: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.includes('?') || trimmed.includes('？')) {
      const matches = trimmed.match(/[^?？]*[?？]/g);
      if (matches) {
        questions.push(...matches.map((s: string) => s.trim()).filter(Boolean));
      } else {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}

/**
 * Returns true if the question is filler/greeting/audience-check and should
 * be discarded. Precedence: greeting patterns > blocklist phrases. Interrogative
 * form does NOT short-circuit — "what do you think?" starts with an
 * interrogative but is still rhetorical, so the blocklist must always run.
 */
export function isRhetorical(question: string): boolean {
  const normalized = question.replace(/[?？]+$/, '').trim().toLowerCase();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    const stripped = normalized
      .replace(/^(so|and|but|well|now|or|um|uh|like)\s+/i, '')
      .trim();
    if (stripped === phrase) return true;
  }

  return false;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export interface TranscriptSegment {
  text?: unknown;
  transcript?: unknown;
  start_ms?: number;
  start?: number;
}

export interface DetectedPausePoint {
  lecture_video_id: string;
  pause_timestamp: number;
  question_content: {
    question: string;
    type: string;
    options: null;
    correctAnswer: null;
    explanation: null;
  };
  question_type: string;
  cognitive_load_score: number;
  reason: string;
  is_active: boolean;
  difficulty_type: string;
  order_index: number;
}

/**
 * Pure conversion: transcript segments → deduplicated pause points.
 * Skips malformed segments (non-string text). Deduplicates any two questions
 * whose `pause_timestamp` falls within 10 seconds.
 */
export function buildPausePointsFromSegments(
  lecture_video_id: string,
  transcript_segments: TranscriptSegment[],
): DetectedPausePoint[] {
  const detectedPausePoints: DetectedPausePoint[] = [];

  for (const seg of transcript_segments) {
    const rawText = seg.text ?? seg.transcript;
    if (typeof rawText !== 'string') continue;
    const startMs: number = seg.start_ms ?? Math.round((seg.start ?? 0) * 1000);

    const questions = extractQuestions(rawText);
    for (const q of questions) {
      if (wordCount(q) < MIN_WORD_COUNT) continue;
      if (isRhetorical(q)) continue;
      if (!hasInterrogativeTrigger(q)) continue;

      const pauseTimestamp = Math.floor(startMs / 1000);
      const isDuplicate = detectedPausePoints.some(
        (pp) => Math.abs(pp.pause_timestamp - pauseTimestamp) < 10,
      );
      if (isDuplicate) continue;

      detectedPausePoints.push({
        lecture_video_id,
        pause_timestamp: pauseTimestamp,
        question_content: {
          question: q,
          type: 'speaker_question',
          options: null,
          correctAnswer: null,
          explanation: null,
        },
        question_type: 'short_answer',
        cognitive_load_score: 5,
        reason: 'Speaker asked this question in the video',
        is_active: true,
        difficulty_type: 'application',
        order_index: detectedPausePoints.length,
      });
    }
  }

  return detectedPausePoints;
}

export interface SupabaseLike {
  from: (table: string) => {
    insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
  };
}

export async function handleDetectRequest(
  body: { lecture_video_id?: string; transcript_segments?: unknown },
  supabase: SupabaseLike,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { lecture_video_id, transcript_segments } = body;

  if (!lecture_video_id || !Array.isArray(transcript_segments)) {
    return {
      status: 400,
      body: { error: 'Missing lecture_video_id or transcript_segments' },
    };
  }

  const detectedPausePoints = buildPausePointsFromSegments(
    lecture_video_id,
    transcript_segments as TranscriptSegment[],
  );

  if (detectedPausePoints.length === 0) {
    return { status: 200, body: { success: true, detected: 0 } };
  }

  const { error } = await supabase
    .from('lecture_pause_points')
    .insert(detectedPausePoints);
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  return {
    status: 200,
    body: { success: true, detected: detectedPausePoints.length },
  };
}
