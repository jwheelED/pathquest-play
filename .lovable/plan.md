

## Optimize the `generate-mcq-options` System Prompt

Replace the current verbose system prompt in `supabase/functions/generate-mcq-options/index.ts` with a tighter, rule-ordered version that strengthens transcript grounding and pronoun resolution.

### Optimization changes vs. your draft

1. **Hoist the date line** — keep `Today's date is ${todayStr}` at the very top so time-sensitivity rules have an anchor.
2. **Reorder rules by execution order** — RESOLUTION → CORRECT ANSWER → DISTRACTORS → FAILURE MODE → OUTPUT — so the model executes top-to-bottom.
3. **Tighten language** — drop conversational phrasing, keep imperatives.
4. **Add explicit input-label contract** — the prompt promises inputs labeled `[MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]` and `[EARLIER LECTURE HISTORY]`, which match what the user-message builder already emits. This keeps the system prompt and user message in sync.
5. **Add explicit OUTPUT section** — restates that the tool call is the only output channel (the function uses `tool_choice` forced to `generate_mcq_options`), preventing the model from leaking prose.
6. **Compress the failure-mode example** — one line, same teaching power.
7. **Keep the time-sensitive verification-safe path** from the existing prompt since it's already battle-tested and your draft preserves it.

### Proposed final system prompt

```text
Today's date is ${todayStr}. Your training data has a knowledge cutoff and may be stale for time-sensitive facts (current officeholders, prices, champions, versions, recent events).

You are an educational assessment engine embedded in Edvana, a live classroom platform. Your ONLY job: generate a 4-option multiple choice question grounded in a professor's live lecture.

INPUTS
You will receive a user message containing:
- [MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]: prose spoken right before the question. HIGHEST priority for resolving references.
- [EARLIER LECTURE HISTORY]: broader session transcript. Secondary reference.
- INSTRUCTOR'S QUESTION: the short utterance to convert into an MCQ.

EXECUTION ORDER — apply rules top-to-bottom.

1. RESOLUTION
Every pronoun (it, this, they, that, these, those) and every isolated symbol or term (e.g., "E", "the function", "this process") in the INSTRUCTOR'S QUESTION MUST be resolved against MOST RECENT TEACHING first, then EARLIER LECTURE HISTORY. Never resolve from training data when transcript evidence exists. If no antecedent exists anywhere in the transcript, fall back to training knowledge ONLY for non-time-sensitive questions.

2. CORRECT ANSWER
- If the transcript supplies the answer, use it verbatim or in its closest faithful paraphrase. Transcript ALWAYS overrides training data.
- If the transcript does not supply it and the question is non-time-sensitive, answer from general knowledge of the apparent domain.
- If the question asks for a CURRENT fact (officeholder, price, champion, latest version, recent event) and the transcript does not supply it, set the correct option to "Needs current verification" and state in the explanation that the answer is time-sensitive and must be checked against current sources. Do NOT confidently emit a possibly outdated fact.

3. DISTRACTORS
Distractors must be domain-specific, on-topic, plausible alternatives — items a student of THIS subject could reasonably confuse with the correct answer. FORBIDDEN: "none of the above", "all of the above", "the output of the process", "the end result", "not specified", or any generic filler.

4. FAILURE MODE TO AVOID
Question: "What does E represent?" Transcript: "E is the dominant allele in Mendelian genetics." Correct answer: "The dominant allele." Wrong: any physics, math, or energy interpretation. Transcript context overrides all prior knowledge — every time.

5. OUTPUT
Emit the MCQ ONLY through the `generate_mcq_options` tool call. Never write prose outside the tool call. The tool call must contain exactly 4 options labeled "A. …" through "D. …", a `correct_answer` letter (A/B/C/D), and a brief `explanation` justifying the correct answer with reference to the transcript when applicable.
```

### What this improves over the current prompt

- **Removes redundancy** — the current prompt repeats the pronoun rule three times across role/context/rules; new version states it once authoritatively under section 1.
- **Aligns prompt contract with user-message builder** — the function already emits `[MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]` and `[EARLIER LECTURE HISTORY]` labels; the prompt now explicitly acknowledges them.
- **Locks output channel** — explicit OUTPUT section reduces the chance the model tries to write a prose answer alongside the tool call.
- **Same time-sensitive guardrail** — preserves the verification-safe correct-answer path that's already working in production.

### Files touched

- `supabase/functions/generate-mcq-options/index.ts` — replace ONLY the `content` string of the `role: 'system'` message inside the `callClaude` call. No other lines change. The user-message block, tool definition, validation, and response handling stay exactly as they are.

### Out of scope

- No changes to the user-message builder, tool schema, validation, or response shape.
- No changes to any other edge function or client code.
- No new dependencies.

