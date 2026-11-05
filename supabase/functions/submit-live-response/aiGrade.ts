import { resolveAiProvider, callAiProvider, lovableGatewayProvider, type AiProvider } from "../_shared/aiProvider.ts";

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

  // Try the primary AI; if it fails, use the backup so a live answer is
  // never left ungraded because one provider had a problem.
  const providers: AiProvider[] = [];
  try { providers.push(resolveAiProvider()); } catch { /* none configured */ }
  const backup = lovableGatewayProvider();
  if (backup && !providers.some((p) => p.name === backup.name)) providers.push(backup);

  for (const ai of providers) {
    const result = await gradeWith(ai, system, user);
    if (result) return result;
  }
  return null;
}

async function gradeWith(ai: AiProvider, system: string, user: string): Promise<WrittenGrade | null> {
  try {
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
              grade: { type: "number", description: "Score from 0 to 100 (100 = fully correct)" },
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
      console.error(`Live AI grading failed (${ai.name}):`, res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.error(`Live AI grading returned no grade (${ai.name})`);
      return null;
    }
    const parsed = JSON.parse(args) as { grade?: unknown; feedback?: unknown };
    let grade = Number(parsed.grade);
    if (!Number.isFinite(grade)) return null;
    // Some models answer on a 0-1 scale; treat that as a fraction.
    if (grade > 0 && grade <= 1) grade = grade * 100;
    return {
      grade: Math.max(0, Math.min(100, Math.round(grade))),
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    };
  } catch (e) {
    console.error(`Live AI grading error (${ai.name}):`, e);
    return null;
  }
}
