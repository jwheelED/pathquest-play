import type { SupabaseLike, HandlerResult } from "../_shared/handlerTypes.ts";
import { normalizeAnswer, calculatePoints } from "./grading.ts";

// Pure request handler for submit-live-response (audit EV-012). Receives the
// parsed body + an injected Supabase-like client. Grades the answer, enforces
// one-response-per-participant, inserts, then best-effort syncs to the gradebook
// (non-blocking — sync failures never affect the primary response).

interface SubmitBody {
  questionId?: string;
  participantId?: string;
  answer?: unknown;
  confidenceLevel?: string | null;
  responseTimeMs?: number | null;
}

interface QuestionContent {
  question?: string;
  type?: string;
  options?: string[];
  correctAnswer?: string;
  questions?: Array<{ question?: string; type?: string; options?: string[]; correctAnswer?: string }>;
}

export async function handleSubmit(
  body: SubmitBody | null,
  deps: { supabase: SupabaseLike },
): Promise<HandlerResult> {
  const { supabase } = deps;
  const { questionId, participantId, answer, confidenceLevel, responseTimeMs } = body ?? {};

  if (!questionId || !participantId || answer === undefined) {
    return { status: 400, body: { error: "Missing required fields: questionId, participantId, answer" } };
  }

  const { data: question, error: questionError } = await supabase
    .from("live_questions")
    .select("question_content, question_number, instructor_id, session_id")
    .eq("id", questionId)
    .single();

  if (questionError || !question) {
    return { status: 404, body: { error: "Question not found" } };
  }

  const questionContent = (question.question_content ?? {}) as QuestionContent;

  let correctAnswer = "";
  let questionType = "multiple_choice";
  let options: string[] = [];

  if (Array.isArray(questionContent.questions) && questionContent.questions.length > 0) {
    const firstQuestion = questionContent.questions[0];
    correctAnswer = (firstQuestion.correctAnswer || "").toString().trim();
    questionType = firstQuestion.type || "multiple_choice";
    options = firstQuestion.options || [];
  } else {
    correctAnswer = (questionContent.correctAnswer || "").toString().trim();
    questionType = questionContent.type || "multiple_choice";
    options = questionContent.options || [];
  }

  // Guard: never grade an MCQ with no correct answer (prevents all-wrong bug).
  if (questionType === "multiple_choice" && (!correctAnswer || correctAnswer.trim() === "")) {
    return {
      status: 422,
      body: {
        error: "Question has no correct answer configured. Please notify your instructor.",
        code: "MISSING_CORRECT_ANSWER",
      },
    };
  }

  const normalizedStudentAnswer = normalizeAnswer(answer!.toString().trim(), questionType, options);
  const normalizedCorrectAnswer = normalizeAnswer(correctAnswer, questionType, options);
  const isCorrect = normalizedStudentAnswer.toUpperCase() === normalizedCorrectAnswer.toUpperCase();
  const { points, multiplier } = calculatePoints(isCorrect, confidenceLevel ?? null);

  // Exactly-once: existence check (the DB unique constraint is the real guard).
  const { data: existingResponse } = await supabase
    .from("live_responses")
    .select("id")
    .eq("question_id", questionId)
    .eq("participant_id", participantId)
    .single();

  if (existingResponse) {
    return { status: 409, body: { error: "Response already submitted", existingId: existingResponse.id } };
  }

  const { data: response, error: insertError } = await supabase
    .from("live_responses")
    .insert({
      question_id: questionId,
      participant_id: participantId,
      answer,
      is_correct: isCorrect,
      confidence_level: confidenceLevel,
      confidence_multiplier: multiplier,
      points_earned: points,
      response_time_ms: responseTimeMs,
    })
    .select()
    .single();

  if (insertError) {
    return { status: 500, body: { error: "Failed to save response", details: insertError.message } };
  }

  // Best-effort sync to student_assignments (LectureCheckInResults gradebook).
  // Non-blocking: any failure here must never affect the primary live response.
  try {
    const q = question as { session_id?: string; instructor_id?: string };
    if (q.session_id && q.instructor_id) {
      const { data: session } = await supabase
        .from("live_sessions").select("course_id").eq("id", q.session_id).single();

      if (session?.course_id) {
        const { data: participant } = await supabase
          .from("live_participants").select("nickname").eq("id", participantId).single();

        if (participant?.nickname) {
          const nickname = participant.nickname.trim().toLowerCase();
          const { data: instructorStudents } = await supabase
            .from("instructor_students").select("student_id")
            .eq("instructor_id", q.instructor_id).eq("course_id", session.course_id);

          if (instructorStudents && instructorStudents.length > 0) {
            const studentIds = instructorStudents.map((s: { student_id: string }) => s.student_id);
            const { data: profiles } = await supabase
              .from("profiles").select("id, full_name").in("id", studentIds);

            const matchedProfile = profiles?.find(
              (p: { id: string; full_name: string | null }) =>
                p.full_name && p.full_name.trim().toLowerCase() === nickname,
            );

            if (matchedProfile) {
              const { data: assignments } = await supabase
                .from("student_assignments")
                .select("id, content, quiz_responses")
                .eq("student_id", matchedProfile.id)
                .eq("instructor_id", q.instructor_id)
                .eq("assignment_type", "lecture_checkin")
                .eq("completed", false)
                .order("created_at", { ascending: false })
                .limit(5);

              if (assignments && assignments.length > 0) {
                const questionText = questionContent.questions?.[0]?.question || questionContent.question || "";
                for (const assignment of assignments) {
                  const content = assignment.content as { questions?: Array<{ question?: string }> };
                  const matchIdx = (content?.questions || []).findIndex((qq) => qq.question === questionText);
                  if (matchIdx >= 0) {
                    const updatedResponses = {
                      ...(assignment.quiz_responses || {}),
                      [matchIdx.toString()]: normalizedStudentAnswer,
                    };
                    await supabase.from("student_assignments").update({
                      completed: true,
                      quiz_responses: updatedResponses,
                      grade: isCorrect ? 100 : 0,
                      response_time_seconds: responseTimeMs ? Math.round(responseTimeMs / 1000) : null,
                    }).eq("id", assignment.id);
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (syncError) {
    console.error("⚠️ Sync to student_assignments failed (non-blocking):", syncError);
  }

  return {
    status: 200,
    body: {
      success: true,
      response: {
        id: response.id,
        isCorrect,
        pointsEarned: points,
        confidenceMultiplier: multiplier,
        correctAnswer,
      },
    },
  };
}
