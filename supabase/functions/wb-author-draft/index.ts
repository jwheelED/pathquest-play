// wb-author-draft — Edvana Whiteboard Tutor
//
// Instructor authoring helper: given a problem statement, Kimi drafts an
// answer key + per-student variant ranges for the instructor to review and
// approve before publishing. This never reaches students directly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { llmCors, llmJson, llmConfigured } from "../_shared/llm.ts";

interface DraftRequest {
  problemText: string;
  title?: string;
  concept?: string;
}

interface ExpectedStep {
  expr: string;
  note: string;
}

interface DraftResult {
  title: string;
  concept: string;
  prompt_template: string;
  range_summary: string;
  variant_ranges: Record<string, { min: number; max: number }>;
  expected_answer: string;
  expected_steps: ExpectedStep[];
  solution_notes: string;
  suggested_reasoning_weight: number;
}

const SYSTEM = `You are a mathematics assignment author for a Socratic whiteboard tutor.
Given a single homework problem, produce a rigorous answer key AND a plan for
generating unique per-student number variants (an anti-cheating feature).

Return ONLY a JSON object with exactly these keys:
- "title": short problem title (<= 5 words)
- "concept": the concept/topic being tested
- "prompt_template": the problem restated with each numeric quantity replaced by a
  {placeholder} token (e.g. "inflated at a rate of {rate} cm³/s ... radius is {r} cm")
- "range_summary": a human-readable one-line description of the variant ranges
- "variant_ranges": object mapping each placeholder to {"min": number, "max": number}
- "expected_answer": the final answer expressed with the SAME {placeholders}
- "expected_steps": ordered array of {"expr": "<math line, may use {placeholders}>", "note": "<why this step>"}
  showing the full worked solution a student should produce
- "solution_notes": the KEY misconception a student is likely to make and what a
  good self-correction looks like
- "suggested_reasoning_weight": integer 50-90, how much of the score should be
  explanation vs. final answer (default 70)

Use real mathematical notation (π, ², ³, ·, ≈). Keep placeholders consistent
across prompt_template, variant_ranges, expected_answer, and expected_steps.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: llmCors });
  }
  try {
    if (!llmConfigured()) {
      return json({ error: "AI service not configured (set OPENROUTER_API_KEY)" }, 500);
    }
    const { problemText, title, concept } = (await req.json()) as DraftRequest;
    if (!problemText || problemText.trim().length < 8) {
      return json({ error: "problemText is required" }, 400);
    }

    const userMsg = [
      title ? `Working title: ${title}` : null,
      concept ? `Concept hint: ${concept}` : null,
      `Problem:\n${problemText.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await llmJson<DraftResult>({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      temperature: 0.3,
      maxTokens: 1600,
    });

    // Clamp weight into range defensively.
    const w = Math.round(result.suggested_reasoning_weight ?? 70);
    result.suggested_reasoning_weight = Math.min(90, Math.max(50, isNaN(w) ? 70 : w));

    return json({ draft: result }, 200);
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
