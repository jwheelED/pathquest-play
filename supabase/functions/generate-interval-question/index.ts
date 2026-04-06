import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// Generic/vague question patterns that should never be sent
const GENERIC_QUESTION_PATTERNS = [
  /can you summarize/i,
  /summarize the key point/i,
  /summarize the main/i,
  /what was the main concept/i,
  /what is the most important takeaway/i,
  /what was the most important concept/i,
  /what did you learn/i,
  /what have we covered/i,
  /what was just discussed/i,
  /recap what was/i,
];

/**
 * Check if a question is too generic/vague to send.
 */
function isGenericQuestion(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  for (const pattern of GENERIC_QUESTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Get a fallback response that respects the format preference.
 * Instead of sending a generic question, return a failure so the system
 * can skip this interval rather than sending a useless question.
 */
function getFallbackResponse(formatPreference: string, confidence: number, reason: string) {
  // If MCQ is preferred, we can't generate a proper MCQ fallback without AI,
  // so return a failure instead of sending a wrong-format generic question.
  if (formatPreference === "multiple_choice" || formatPreference === "coding") {
    return {
      success: false,
      error: "Could not generate a relevant question in the requested format",
      error_type: "fallback_format_mismatch",
      confidence,
      reasoning: reason,
    };
  }
  // For short_answer, we also skip generic questions now
  return {
    success: false,
    error: "Could not generate a relevant question",
    error_type: "no_relevant_fallback",
    confidence,
    reasoning: reason,
  };
}

// Stopwords for keyword overlap validation
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "its", "his", "her", "their", "our", "your", "my", "it", "he", "she",
  "they", "we", "you", "me", "him", "them", "us", "following", "described",
  "using", "based", "according", "within", "also", "well", "much",
  "many", "any", "still", "already", "even", "given", "however",
  "question", "answer", "option", "correct", "incorrect", "true", "false",
  "primary", "purpose", "component", "necessary", "valid", "type", "data",
]);

/**
 * Check if a generated question is relevant to the transcript content.
 * Returns { relevant: true } or { relevant: false, reason: string }
 */
function checkRelevance(
  questionText: string,
  transcript: string,
): { relevant: boolean; reason?: string } {
  // Handle coding question objects
  const textToCheck = typeof questionText === "string"
    ? questionText
    : (questionText as any)?.title + " " + (questionText as any)?.description || "";

  // Extract significant terms from the question (length > 3, not stopwords)
  const questionWords = textToCheck
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !STOPWORDS.has(w));

  const uniqueTerms = [...new Set(questionWords)];

  // If the question has fewer than 3 key terms, skip validation (too short to judge)
  if (uniqueTerms.length < 3) {
    return { relevant: true };
  }

  const transcriptLower = transcript.toLowerCase();

  // Count how many question terms appear in the transcript
  let matches = 0;
  for (const term of uniqueTerms) {
    if (transcriptLower.includes(term)) {
      matches++;
    }
  }

  const ratio = matches / uniqueTerms.length;

  console.log(`🔍 Relevance check: ${matches}/${uniqueTerms.length} terms found (${(ratio * 100).toFixed(0)}%)`);
  console.log(`   Terms: [${uniqueTerms.join(", ")}]`);
  console.log(`   Matched: [${uniqueTerms.filter((t: string) => transcriptLower.includes(t)).join(", ")}]`);
  console.log(`   Missing: [${uniqueTerms.filter((t: string) => !transcriptLower.includes(t)).join(", ")}]`);

  if (ratio < 0.3) {
    return {
      relevant: false,
      reason: `Only ${matches}/${uniqueTerms.length} key terms found in transcript (${(ratio * 100).toFixed(0)}% overlap). Missing terms: ${uniqueTerms.filter((t: string) => !transcriptLower.includes(t)).join(", ")}`,
    };
  }

  return { relevant: true };
}

/**
 * Layer 4: Check if a generated question falls within the course's subject area.
 * Builds a corpus from course title, topics, and material context, then checks
 * what percentage of question terms appear in that corpus.
 * Uses a lower threshold (20%) than transcript overlap since the course corpus is smaller.
 */
function checkCourseScopeRelevance(
  questionText: string,
  courseContext: { title: string; topics?: string[] } | null,
  materialContext: Array<{ title: string; content?: string }>,
): { relevant: boolean; reason?: string } {
  // If no course context provided, skip this check
  if (!courseContext?.title) {
    return { relevant: true };
  }

  // Build course corpus from title + topics + material titles + material content snippets
  let corpus = courseContext.title;
  if (courseContext.topics?.length) {
    corpus += " " + courseContext.topics.join(" ");
  }
  for (const material of materialContext) {
    corpus += " " + material.title;
    if (material.content) {
      corpus += " " + material.content.slice(0, 500);
    }
  }

  const corpusLower = corpus.toLowerCase();

  // Extract significant terms from the question
  const textToCheck = typeof questionText === "string"
    ? questionText
    : (questionText as Record<string, string>)?.title + " " + (questionText as Record<string, string>)?.description || "";

  const questionWords = textToCheck
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !STOPWORDS.has(w));

  const uniqueTerms = [...new Set(questionWords)];

  // If too few terms, skip validation
  if (uniqueTerms.length < 3) {
    return { relevant: true };
  }

  let matches = 0;
  for (const term of uniqueTerms) {
    if (corpusLower.includes(term)) {
      matches++;
    }
  }

  const ratio = matches / uniqueTerms.length;

  console.log(`🎓 Course scope check: ${matches}/${uniqueTerms.length} terms found (${(ratio * 100).toFixed(0)}%)`);
  console.log(`   Course: "${courseContext.title}"`);
  console.log(`   Matched: [${uniqueTerms.filter((t: string) => corpusLower.includes(t)).join(", ")}]`);
  console.log(`   Missing: [${uniqueTerms.filter((t: string) => !corpusLower.includes(t)).join(", ")}]`);

  if (ratio < 0.2) {
    return {
      relevant: false,
      reason: `Only ${matches}/${uniqueTerms.length} key terms found in course corpus (${(ratio * 100).toFixed(0)}% overlap). Course: "${courseContext.title}". Missing terms: ${uniqueTerms.filter((t: string) => !corpusLower.includes(t)).join(", ")}`,
    };
  }

  return { relevant: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      interval_transcript,
      interval_minutes,
      format_preference = "multiple_choice",
      coding_question_style = "simple",
      difficulty_preference = "medium",
      force_send = false,
      strict_mode = false,
      materialContext = [],
      slide_context = null,
      course_context = null,
    } = await req.json();

    console.log("📝 Generating interval question");
    console.log("  Transcript length:", interval_transcript?.length || 0);
    console.log("  Interval minutes:", interval_minutes);
    console.log("  Format preference:", format_preference);
    console.log("  Difficulty preference:", difficulty_preference);
    console.log("  Course context:", course_context ? `${course_context.title} (${course_context.topics?.join(", ") || "no topics"})` : "none");

    // Determine content source: transcript or materials
    const hasTranscript = interval_transcript && interval_transcript.length >= 50;
    const hasMaterials = materialContext && materialContext.length > 0 &&
      materialContext.some((m: any) => m.content && m.content.length > 50);
    const usingMaterialsFallback = !hasTranscript && hasMaterials;

    if (!hasTranscript && !hasMaterials) {
      if (!force_send) {
        return new Response(JSON.stringify({
          success: false,
          error: "Not enough content to generate a question (no transcript or materials)",
          error_type: "insufficient_content",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (usingMaterialsFallback) {
      console.log("📚 Transcript insufficient — falling back to uploaded course materials");
    }

    // Build the primary content source
    let primaryContent = "";
    let contentSourceLabel = "";

    if (usingMaterialsFallback) {
      // Use materials as the primary content
      contentSourceLabel = "course materials";
      for (const material of materialContext.slice(0, 3)) {
        if (material.content) {
          primaryContent += `\n--- ${material.title} ---\n${material.content.slice(0, 3000)}\n`;
        }
      }
      primaryContent = primaryContent.slice(0, 8000);
    } else {
      // Use transcript as the primary content
      contentSourceLabel = "lecture transcript";
      primaryContent = interval_transcript.slice(-8000);
    }

    // Build supplementary context (materials supplement transcript, not the other way around)
    let additionalContext = "";
    if (!usingMaterialsFallback && hasMaterials) {
      additionalContext += "\n\nCourse Materials Context:\n";
      for (const material of materialContext.slice(0, 2)) {
        additionalContext += `- ${material.title}: ${material.content?.slice(0, 1000) || ""}\n`;
      }
    }
    if (slide_context) {
      additionalContext += `\n\nCurrent Slide: ${slide_context}\n`;
    }

    // Course context constraint
    let courseConstraint = "";
    if (course_context?.title) {
      courseConstraint += `\n\n🎓 COURSE CONSTRAINT: This is a "${course_context.title}" class.`;
      if (course_context.topics?.length) {
        courseConstraint += ` Relevant topics include: ${course_context.topics.join(", ")}.`;
      }
      courseConstraint += ` Only generate questions relevant to this subject area.`;
    }

    // Long interval guidance
    const longIntervalGuidance = interval_minutes >= 20
      ? `\n⚠️ LONG INTERVAL (${interval_minutes} min): Focus on THE SINGLE MOST IMPORTANT concept. Prioritize topics that were emphasized or repeated.`
      : "";

    // Build difficulty instructions
    let difficultyInstructions = "";
    const diffLevel = (difficulty_preference || "medium").toLowerCase();
    if (diffLevel === "easy") {
      difficultyInstructions = `\nDIFFICULTY LEVEL: EASY - Generate a simple question focusing on basic recall, definitions, or straightforward facts. The answer should be directly stated in the content.`;
    } else if (diffLevel === "hard") {
      difficultyInstructions = `
DIFFICULTY LEVEL: HARD

Question Stem Requirements:
- Ask students to APPLY, ANALYZE, or EVALUATE — never just recall a definition.
- Prefer "What would happen if...", "Why does X lead to Y rather than Z?", "Compare X and Y in the context of...", or "Which of these scenarios demonstrates [concept]?"
- Require connecting TWO or more concepts from the ${groundingSource}.
- Avoid questions answerable by someone who only memorized a glossary.
- Frame questions around cause-effect reasoning, edge cases, predicting outcomes, or identifying exceptions.

MCQ Distractor Requirements (when format is multiple_choice):
- Each distractor must represent a SPECIFIC misconception or common student error.
- Distractors should be plausible to someone who partially understands the material.
- Match the length, detail, and grammatical structure of the correct answer.
- NEVER use "All of the above", "None of the above", or vague fillers like "Not specified in lecture".
- At least one distractor should be a "near-miss" — correct logic but wrong conclusion, or right concept applied to the wrong context.
- At least one distractor should reflect a common confusion between similar terms or concepts from the ${groundingSource}.`;
    } else {
      difficultyInstructions = `\nDIFFICULTY LEVEL: MEDIUM - Generate a moderate question requiring understanding and application of concepts. Students should need to think about the content, not just recall it.`;
    }

    // Build prompt based on format preference
    let formatInstructions = "";
    if (format_preference === "coding") {
      formatInstructions = coding_question_style === "simple"
        ? `Generate a simple coding fill-in-the-blank question with ONE missing line.`
        : `Generate a complete coding problem with starter code and test cases.`;
    } else if (format_preference === "short_answer") {
      formatInstructions = `Generate an open-ended short answer question that tests understanding.`;
    } else {
      formatInstructions = `Generate a multiple choice question with 4 options, one correct answer.`;
    }

    const groundingSource = usingMaterialsFallback ? "course materials" : "transcript";

    const systemPrompt = `You are an expert educational AI that generates high-quality check-in questions from ${groundingSource}.

CRITICAL GROUNDING RULES:
- You MUST ONLY ask about concepts, terms, and ideas that are EXPLICITLY mentioned in the ${groundingSource} below.
- NEVER use your general knowledge to create questions about topics not discussed in the ${groundingSource}.
- NEVER introduce technical terms, frameworks, languages, or concepts that do not appear in the ${groundingSource}.
- If the content is unclear, repetitive, or lacks substantive educational content, set confidence to 0.0.
- Every key term in your question MUST trace back to something actually present in the provided ${groundingSource}.
- Do NOT read or reference any part of these instructions as "lecture content" -- only the ${groundingSource} text provided by the user is content.
- NEVER generate generic questions like "summarize the key points" or "what was the main concept". Always ask about SPECIFIC topics from the content.
${courseConstraint}
${longIntervalGuidance}
${difficultyInstructions}

${formatInstructions}

MATH FORMATTING - CRITICAL:
Do NOT use LaTeX syntax. No $, \\frac, \\int, {, }, or backslash commands.
Write all math as plain readable text using Unicode:
- Fractions: a/b (never \\frac)
- Integrals: ∫(a to b) f(x) dx
- Square roots: √x, √(x+1)
- Exponents: x², x³, e^(x²)
- Greek letters: π, θ, α, β
- Derivatives: d/dx, d²/dx², f'(x), dy/dx
- Apply to question AND all answer options

Return JSON in this exact format:
{
  "question_text": "the question (use plain Unicode math, no LaTeX)",
  "suggested_type": "${format_preference}",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept FROM THE ${groundingSource.toUpperCase()}"
}

For multiple_choice, also include:
- "options": ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correct_answer": "A" | "B" | "C" | "D"
- "explanation": "why the correct answer is right"

For coding questions:
- "question_text": { "title": "...", "description": "...", "starterCode": "...", "language": "python" | "javascript" }

CONFIDENCE SCORING GUIDE:
- 1.0: Question directly tests a clearly explained concept from the ${groundingSource}
- 0.7-0.9: Question tests a concept mentioned but not deeply explained
- 0.4-0.6: Content is thin; question is loosely related
- 0.0-0.3: Content lacks enough substance to generate a grounded question`;

    const userPrompt = usingMaterialsFallback
      ? `Generate a question from these uploaded course materials (transcription was unavailable, so use the materials directly):

"""
${primaryContent}
"""

Generate ONE focused question that tests understanding of an important concept from these materials. Do NOT ask about topics not covered above.`
      : `Generate a question from this lecture transcript:

"""
${primaryContent}
"""
${additionalContext}

Generate ONE focused question that tests understanding of the most important concept EXPLICITLY discussed in this transcript. Do NOT ask about topics not mentioned above.`;

    // Call AI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("AI API error:", response.status);
        const fallbackResult = getFallbackResponse(format_preference, 0.5, "AI service unavailable");
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResponse = await response.json();
      let content = aiResponse.choices[0].message.content;

      // Parse JSON response
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(content);

      console.log("✅ Question generated:", parsed.question_text?.substring?.(0, 100) || parsed.question_text?.title);
      console.log("   Confidence:", parsed.confidence);

      // Layer 2: Confidence threshold check
      if ((parsed.confidence || 0) < 0.6) {
        console.warn(`⚠️ Low confidence (${parsed.confidence}) - rejecting question`);
        const fallbackResult = getFallbackResponse(format_preference, parsed.confidence,
          `AI confidence too low (${parsed.confidence}). Original: "${parsed.question_text?.substring?.(0, 80) || parsed.question_text?.title}".`);
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Layer 2b: Generic/vague question filter
      const questionTextStr = typeof parsed.question_text === "string" ? parsed.question_text : "";
      if (isGenericQuestion(questionTextStr)) {
        console.warn(`⚠️ Generic question blocked: "${questionTextStr.substring(0, 80)}"`);
        const fallbackResult = getFallbackResponse(format_preference, parsed.confidence || 0.5,
          `Generic/vague question blocked: "${questionTextStr.substring(0, 80)}". Will retry next interval.`);
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Layer 3: Keyword overlap validation
      const questionTextForCheck = typeof parsed.question_text === "string"
        ? parsed.question_text
        : `${parsed.question_text?.title || ""} ${parsed.question_text?.description || ""}`;

      // Also check MCQ options for relevance if present
      let textToValidate = questionTextForCheck;
      if (parsed.options && Array.isArray(parsed.options)) {
        textToValidate += " " + parsed.options.join(" ");
      }

      const relevance = checkRelevance(textToValidate, primaryContent);

      if (!relevance.relevant) {
        console.warn(`⚠️ Relevance check failed: ${relevance.reason}`);
        const fallbackResult = getFallbackResponse(format_preference, parsed.confidence,
          `Relevance validation failed: ${relevance.reason}. Original question: "${questionTextForCheck.substring(0, 80)}".`);
        return new Response(JSON.stringify(fallbackResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Layer 4: Course scope validation — ONLY when using materials fallback.
      // When using live transcript, the transcript IS the ground truth of what the
      // instructor is teaching right now. The course title/topics may not reflect
      // the current lecture topic (e.g. a guest lecture, topic detour, or
      // course metadata that hasn't been updated). Since Layer 3 already confirmed
      // the question is grounded in the transcript, skip this check.
      if (usingMaterialsFallback) {
        const courseScopeRelevance = checkCourseScopeRelevance(
          textToValidate,
          course_context,
          materialContext,
        );

        if (!courseScopeRelevance.relevant) {
          console.warn(`⚠️ Course scope check failed: ${courseScopeRelevance.reason}`);
          const fallbackResult = getFallbackResponse(format_preference, parsed.confidence,
            `Course scope validation failed: ${courseScopeRelevance.reason}. Original question: "${questionTextForCheck.substring(0, 80)}".`);
          return new Response(JSON.stringify(fallbackResult), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.log("ℹ️ Skipping course scope check — question is grounded in live transcript");
      }

      // Shuffle MCQ options so correct answer isn't always A
      // Uses index tracking to handle duplicate option text correctly
      let finalOptions = parsed.options;
      let finalCorrectAnswer = parsed.correct_answer;
      if (parsed.suggested_type === "multiple_choice" || format_preference === "multiple_choice") {
        if (finalOptions && Array.isArray(finalOptions) && finalOptions.length === 4 && finalCorrectAnswer) {
          const letters = ['A', 'B', 'C', 'D'];
          const correctIdx = letters.indexOf(String(finalCorrectAnswer).trim().toUpperCase());
          if (correctIdx !== -1) {
            // Strip prefixes and track correct index
            const augmented = finalOptions.map((o: string, i: number) => ({
              text: o.replace(/^[A-D][\).\-\s]+\s*/i, '').trim(),
              wasCorrect: i === correctIdx,
            }));

            // Check for duplicate option text — skip shuffle if found
            const uniqueTexts = new Set(augmented.map((o: { text: string }) => o.text.toLowerCase()));
            if (uniqueTexts.size < 4) {
              console.warn('⚠️ Duplicate interval MCQ options — skipping shuffle');
            } else {
              // Fisher-Yates shuffle
              for (let i = augmented.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [augmented[i], augmented[j]] = [augmented[j], augmented[i]];
              }

              const newIdx = augmented.findIndex((o: { wasCorrect: boolean }) => o.wasCorrect);
              if (newIdx !== -1) {
                finalCorrectAnswer = letters[newIdx];
                finalOptions = augmented.map((o: { text: string }, i: number) => `${letters[i]}. ${o.text}`);
                console.log(`🔀 Shuffled interval MCQ: correct answer → ${finalCorrectAnswer}`);
              } else {
                console.error('🚫 Shuffle tracking failed — keeping original order');
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        question_text: parsed.question_text,
        suggested_type: parsed.suggested_type || format_preference,
        confidence: parsed.confidence || 0.8,
        options: finalOptions,
        correct_answer: finalCorrectAnswer,
        explanation: parsed.explanation,
        reasoning: parsed.reasoning,
        is_fallback: false,
        relevance_rejected: false,
        from_materials: usingMaterialsFallback,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (aiError: any) {
      clearTimeout(timeoutId);
      console.error("AI error:", aiError);

      // Return failure instead of generic fallback
      const fallbackResult = getFallbackResponse(format_preference, 0.5, `AI error: ${aiError.message}`);
      return new Response(JSON.stringify(fallbackResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
