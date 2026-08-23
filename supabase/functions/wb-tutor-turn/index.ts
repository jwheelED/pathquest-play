// wb-tutor-turn — Edvana Whiteboard Tutor
//
// One Socratic tutor turn. Given the problem, the instructor-approved answer
// key, the current board, the transcript so far, and the student's latest
// message, Kimi:
//   1. transcribes the student's words into a formatted board line (if any),
//   2. replies Socratically — probing the exact line the student wrote,
//      NEVER stating the next step,
//   3. flags a misconception when the student's line is wrong.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { llmCors, llmJson, llmConfigured } from "../_shared/llm.ts";

interface BoardStepIn {
  expr: string;
  provenance: string;
}
interface TurnRequest {
  problemText: string;
  expectedAnswer?: string;
  expectedSteps?: { expr: string; note: string }[];
  solutionNotes?: string;
  board: BoardStepIn[];
  transcript: { who: "you" | "ai"; text: string }[];
  studentMessage: string;
  mode?: "type" | "talk" | "photo";
}

interface TurnResult {
  board_step: null | {
    expr: string;
    provenance: "from_you" | "corrected" | "self_corrected" | "you_drew" | "answer";
    struck: boolean;
    annotation: string | null;
  };
  reply: string;
  misconception: null | { body: string };
  is_probe: boolean;
  accepted: boolean;
}

const SYSTEM = `You are Edvana, a Socratic math whiteboard tutor. A student is working ONE
problem out loud (or typed). You have the instructor-approved answer key.

Your rules, every turn:
- NEVER state the next step or give the answer. You ask questions.
- When the student states a mathematical step, transcribe it into a clean board
  line using real notation (π, ², ³, ·, ≈, /). That becomes "board_step".
- If the student's line is CORRECT, briefly affirm and ask them to justify or take
  the next step themselves. Set accepted=true.
- If the student's line has a MISCONCEPTION (e.g. dropping the chain-rule · dr/dt),
  do NOT correct it. Probe the specific line so they find it. Set accepted=false,
  set "misconception".body to a short description, and set the board_step.struck
  or board_step.annotation to mark the line under question.
- If the student self-corrects a prior error, mark the new line provenance
  "self_corrected" and affirm — self-correction is a POSITIVE.
- If the student only chats (no math), board_step = null.
- Keep replies to 1-3 sentences, warm and specific to what they wrote.

Return ONLY a JSON object:
{
  "board_step": null | { "expr": string, "provenance": "from_you"|"corrected"|"self_corrected"|"you_drew"|"answer", "struck": boolean, "annotation": string|null },
  "reply": string,
  "misconception": null | { "body": string },
  "is_probe": boolean,
  "accepted": boolean
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: llmCors });
  }
  try {
    if (!llmConfigured()) {
      return json({ error: "AI service not configured (set OPENROUTER_API_KEY)" }, 500);
    }
    const body = (await req.json()) as TurnRequest;
    if (!body.studentMessage || !body.problemText) {
      return json({ error: "problemText and studentMessage are required" }, 400);
    }

    const context = {
      problem: body.problemText,
      answer_key: {
        expected_answer: body.expectedAnswer ?? null,
        expected_steps: body.expectedSteps ?? [],
        likely_misconception: body.solutionNotes ?? null,
      },
      board_so_far: body.board ?? [],
      transcript_so_far: (body.transcript ?? []).slice(-12),
      student_just_said: body.studentMessage,
      mode: body.mode ?? "type",
    };

    const result = await llmJson<TurnResult>({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(context) },
      ],
      temperature: 0.5,
      maxTokens: 700,
    });

    // Normalize
    if (!result.reply) result.reply = "Tell me more about that step.";
    if (result.board_step && !result.board_step.provenance) {
      result.board_step.provenance = result.accepted ? "from_you" : "corrected";
    }

    return json({ turn: result }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...llmCors, "Content-Type": "application/json" },
  });
}
