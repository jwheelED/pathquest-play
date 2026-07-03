import { describe, it, expect } from "vitest";
import { handleSubmit } from "../submit-live-response/handler.ts";
import { makeMockSupabase } from "./mockSupabase.ts";

// A question with session_id=null so the best-effort gradebook sync is skipped
// (the sync requires both session_id and instructor_id).
const mcqQuestion = {
  question_content: {
    question: "How many bones in the adult body?",
    type: "multiple_choice",
    options: ["A. 106", "B. 206", "C. 306", "D. 406"],
    correctAnswer: "B",
  },
  question_number: 1,
  instructor_id: "i1",
  session_id: null,
};

const base = { questionId: "q1", participantId: "p1", confidenceLevel: "high" as const, responseTimeMs: 1200 };

describe("handleSubmit (characterization)", () => {
  it("400 when required fields are missing", async () => {
    const { client } = makeMockSupabase();
    expect((await handleSubmit({ participantId: "p1", answer: "B" }, { supabase: client })).status).toBe(400);
    const { client: c2 } = makeMockSupabase();
    expect((await handleSubmit({ questionId: "q1", answer: "B" }, { supabase: c2 })).status).toBe(400);
  });

  it("404 when the question does not exist", async () => {
    const { client } = makeMockSupabase({ live_questions: [{ data: null }] });
    const res = await handleSubmit({ ...base, answer: "B" }, { supabase: client });
    expect(res.status).toBe(404);
  });

  it("422 when an MCQ has no configured correct answer", async () => {
    const { client } = makeMockSupabase({
      live_questions: [{ data: { ...mcqQuestion, question_content: { ...mcqQuestion.question_content, correctAnswer: "" } } }],
    });
    const res = await handleSubmit({ ...base, answer: "B" }, { supabase: client });
    expect(res.status).toBe(422);
    expect((res.body as { code?: string }).code).toBe("MISSING_CORRECT_ANSWER");
  });

  it("409 when a response already exists for this participant/question", async () => {
    const { client } = makeMockSupabase({
      live_questions: [{ data: mcqQuestion }],
      live_responses: [{ data: { id: "existing-1" } }], // existence check finds a row
    });
    const res = await handleSubmit({ ...base, answer: "B" }, { supabase: client });
    expect(res.status).toBe(409);
    expect((res.body as { existingId?: string }).existingId).toBe("existing-1");
  });

  it("200 and grades a correct answer (with confidence points)", async () => {
    const { client, calls } = makeMockSupabase({
      live_questions: [{ data: mcqQuestion }],
      live_responses: [
        { data: null }, // existence check: none
        { data: { id: "resp-1" } }, // insert
      ],
    });
    const res = await handleSubmit({ ...base, answer: "B" }, { supabase: client });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      response: { id: "resp-1", isCorrect: true, pointsEarned: 30, confidenceMultiplier: 3, correctAnswer: "B" },
    });
    // the inserted row recorded correctness
    const insert = calls.find((c) => c.table === "live_responses" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ question_id: "q1", participant_id: "p1", is_correct: true });
  });

  it("200 and marks an incorrect answer wrong", async () => {
    const { client } = makeMockSupabase({
      live_questions: [{ data: mcqQuestion }],
      live_responses: [{ data: null }, { data: { id: "resp-2" } }],
    });
    const res = await handleSubmit({ ...base, answer: "A" }, { supabase: client });
    expect(res.status).toBe(200);
    expect((res.body as { response: { isCorrect: boolean } }).response.isCorrect).toBe(false);
  });

  it("500 when the response insert fails", async () => {
    const { client } = makeMockSupabase({
      live_questions: [{ data: mcqQuestion }],
      live_responses: [{ data: null }, { data: null, error: { message: "insert boom" } }],
    });
    const res = await handleSubmit({ ...base, answer: "B" }, { supabase: client });
    expect(res.status).toBe(500);
  });
});
