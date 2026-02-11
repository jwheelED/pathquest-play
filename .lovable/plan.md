

## Plan: Add Relevance Guardrails to Auto-Generated Questions

### Problem

During a pilot lecture, questions 4, 5, and 6 were completely unrelated to the lecture material (e.g., "Which of the following is not a valid JSON data type?" during a non-JSON lecture). The AI is generating generic CS trivia instead of questions grounded in the actual transcript content.

### Root Cause

The `generate-interval-question` edge function has no relevance enforcement:

1. **Weak prompt grounding** -- The AI is told to "generate a question from this lecture content" but is never told it MUST NOT use outside knowledge or fabricate topics not mentioned in the transcript.
2. **No confidence threshold** -- The AI returns a `confidence` score (0-1), but it is passed through without any validation. Even a 0.1 confidence question gets sent to students.
3. **No relevance validation** -- There is no second check to verify the generated question actually relates to transcript keywords or the course context.
4. **Course context underutilized** -- The `course_context` (course title, topics) is included as a footnote but not used as a constraint to reject off-topic output.

### Solution

Add a multi-layer relevance enforcement system:

#### Layer 1: Stronger Prompt Grounding (Primary Fix)
In `generate-interval-question/index.ts`, add explicit anti-hallucination instructions to the system prompt:

- "You MUST ONLY generate questions about topics explicitly mentioned in the transcript"
- "NEVER use your general knowledge to create questions about topics not discussed"
- "If the transcript doesn't contain enough substantive content, return a confidence of 0.0"
- Include the course title/topics as a constraint: "This is a [Course Title] class -- only generate questions relevant to this subject"

#### Layer 2: Confidence-Based Rejection
After the AI responds, check the `confidence` field. If confidence is below 0.6, reject the question and use a generic fallback instead of sending an irrelevant question. This catches cases where the AI itself signals low confidence.

#### Layer 3: Keyword Overlap Validation
Add a lightweight relevance check that compares significant words from the generated question against the transcript. If the question introduces multiple concepts that don't appear anywhere in the transcript (e.g., "JSON" when the transcript never mentions JSON), reject it.

- Extract non-stopword nouns/terms from the question
- Check how many appear in the transcript
- If fewer than 30% of the question's key terms appear in the transcript, flag as irrelevant and use fallback

#### Layer 4: Apply Same Fix to Voice Command Questions
The `extract-voice-command-question` function doesn't have this problem (it extracts directly from speech), but the `format-and-send-question` function's MCQ/coding generators should also get the anti-hallucination prompt additions since they take the extracted question and may embellish it.

### Changes

#### File 1: `supabase/functions/generate-interval-question/index.ts`
- Enhance system prompt with strict grounding rules and anti-hallucination instructions
- Add course context as a constraint (not just a hint)
- Add confidence threshold check (reject < 0.6)
- Add keyword overlap validation function
- Return `relevance_rejected: true` when a question fails validation so the client knows what happened

#### File 2: `supabase/functions/format-and-send-question/index.ts`
- Add grounding instructions to `generateMCQ()` and `generateCodingQuestion()` prompts: "Options and distractors MUST relate to the lecture content provided, not general knowledge"
- Pass course context more prominently in the prompt

### Technical Details

**Keyword overlap validation (pseudocode):**
```text
function checkRelevance(questionText, transcript):
    stopwords = {the, a, an, is, are, of, in, to, for, ...}
    questionTerms = unique words from questionText, length > 3, not in stopwords
    transcriptLower = transcript.toLowerCase()
    
    matches = count of questionTerms found in transcriptLower
    ratio = matches / questionTerms.length
    
    if ratio < 0.3 and questionTerms.length >= 3:
        return { relevant: false, reason: "Question introduces terms not in transcript" }
    return { relevant: true }
```

**Enhanced system prompt addition:**
```text
CRITICAL GROUNDING RULES:
- You MUST ONLY ask about concepts, terms, and ideas that appear in the transcript
- NEVER generate questions about topics not explicitly discussed (e.g., don't ask about JSON if JSON was never mentioned)
- If the transcript is unclear or lacks substantive content, set confidence to 0.0
- Every key term in your question MUST trace back to something said in the lecture
```

### What This Prevents

- Questions about JSON in a non-JSON lecture
- Questions about "long-interval check-in instructions" (the AI was reading its own system prompt context as lecture content)
- Generic CS trivia questions when transcript quality is low
- Any question where the AI uses general knowledge instead of transcript content

