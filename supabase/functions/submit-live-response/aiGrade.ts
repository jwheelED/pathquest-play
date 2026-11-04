import { resolveAiProvider, callAiProvider } from "../_shared/aiProvider.ts";

export interface WrittenGradeInput {
  question: string;
  expectedAnswer: string;
  answer: string;
  questionType: string;
}

export interface WrittenGrade {
  grade: number;
  feedback: string;
}

// Same provider + generous, concept-focused philosophy as auto-grade-short-answer
// and auto-grade-coding, condensed for live-session latency.
export async function gradeWrittenAnswer(input: WrittenGradeInput): Promise<WrittenGrade | null> {
  const isCoding = input.questionType === "coding";
  const system = isCoding
    ? "You are a LENIENT coding grader focused on CONCEPTUAL UNDERSTANDING. If the student uses the right algorithm/approach, award 90-100 even with minor syntax or off-by-one errors. Only reduce significantly if the approach is fundamentally wrong. Give 1-2 sentences of constructive feedback. Use plain Unicode math, no LaTeX."
    : "You are a GENEROUS educational grader. If the participant demonstrates understanding of the core concept, award 85-100 even with imperfect wording, synonyms or brevity. Deduct significantly only for factual errors or missing the core concept. Give 1-2 sentences of constructive feedback. Use plain Unicode math, no LaTeX.";
  const user = `Question: ${input.question}
Expected answer: ${input.expectedAnswer || "(infer from the question)"}

Participant's ${isCoding ? "code" : "answer"}:
${input.answer.slice(0, 5000)}`;

  try {
    const ai = resolveAiProvider();
    const res = await callAiProvider(ai, {
      model: ai.defaultModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{
        type: "function",
        function: {
          name: "grade_answer",
          description: "Grade the participant's answer",
          parameters: {
            type: "object",
            properties: {
              grade: { type: "number", description: "0-100" },
              feedback: { type: "string" },
            },
            required: ["grade", "feedback"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "grade_answer" } },
      temperature: 0.3,
    });
    if (!res.ok) {
      console.error("Live AI grading failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as { grade?: unknown; feedback?: unknown };
    const grade = Number(parsed.grade);
    if (!Number.isFinite(grade)) return null;
    return {
      grade: Math.max(0, Math.min(100, Math.round(grade))),
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    };
  } catch (e) {
    console.error("Live AI grading error:", e);
    return null;
  }
}
