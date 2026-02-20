import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch instructor preferences to respect their coding settings
    const authHeader = req.headers.get("Authorization");
    let instructorPreference = "multiple_choice";
    let codingQuestionStyle = "full";
    let difficultyPreference = "medium";

    if (authHeader) {
      try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("question_format_preference, coding_question_style, question_difficulty_preference")
            .eq("id", user.id)
            .single();

          if (profile) {
            instructorPreference = profile.question_format_preference || "multiple_choice";
            codingQuestionStyle = profile.coding_question_style || "full";
            difficultyPreference = profile.question_difficulty_preference || "medium";
            console.log(`👤 Instructor preference: ${instructorPreference}, coding style: ${codingQuestionStyle}, difficulty: ${difficultyPreference}`);
          }
        }
      } catch (e) {
        console.log("Could not fetch instructor preferences, using defaults");
      }
    }

    const { recentTranscript } = await req.json();

    if (!recentTranscript || recentTranscript.length < 10) {
      return new Response(JSON.stringify({ error: "No transcript provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove voice command phrases from transcript before processing
    let cleanedTranscript = recentTranscript;
    const commandPatterns = [
      /send\s+(the\s+|a\s+|this\s+)?question(\s+now)?/gi,
      /question\s+now/gi,
      /send\s+now/gi,
      /send\s+it(\s+now)?/gi,
      /send\s+this(\s+now)?/gi,
    ];

    for (const pattern of commandPatterns) {
      cleanedTranscript = cleanedTranscript.replace(pattern, "");
    }
    cleanedTranscript = cleanedTranscript.trim();

    console.log("🎤 Voice command triggered - extracting question from:", cleanedTranscript.substring(0, 100));
    console.log(
      "📏 Cleaned transcript length:",
      cleanedTranscript.length,
      "characters (original:",
      recentTranscript.length,
      ")",
    );

    if (cleanedTranscript.length < 15) {
      return new Response(
        JSON.stringify({
          error: "Not enough content before the voice command. Please speak more of your question first.",
          success: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build difficulty instruction for voice command
    let difficultyInstruction = "";
    const diffLevel = (difficultyPreference || "medium").toLowerCase();
    if (diffLevel === "easy") {
      difficultyInstruction = `\n\nDIFFICULTY LEVEL: EASY - When extracting and phrasing the question, keep it simple. Focus on basic recall, definitions, or straightforward facts.`;
    } else if (diffLevel === "hard") {
      difficultyInstruction = `\n\nDIFFICULTY LEVEL: HARD - When extracting and phrasing the question, make it challenging. Focus on analysis, synthesis, evaluation, or connecting multiple concepts.`;
    } else {
      difficultyInstruction = `\n\nDIFFICULTY LEVEL: MEDIUM - When extracting and phrasing the question, target understanding and application of concepts.`;
    }

    const systemPrompt = `You are an expert at extracting questions from lecture transcripts with PERFECT accuracy.

Your ONLY job is to find and return the COMPLETE question that appears RIGHT BEFORE the "send question now" command.

CRITICAL RULES - VIOLATIONS RESULT IN FAILURE:
1. Return THE ENTIRE QUESTION - from the first word to the final punctuation
2. DO NOT truncate, shorten, or cut off ANY words
3. DO NOT paraphrase or modify ANY words
4. The question MUST end with "?" or "!" or "." - ADD PUNCTUATION if missing but question is complete
5. The question MUST make complete grammatical sense when read alone
6. If the question is a question (contains what/how/why/which/who), ADD "?" at the end if missing

COMMON FAILURE PATTERNS TO AVOID:
❌ "what does the death" → WRONG (truncated)
✅ "what does the death represent?" → CORRECT (complete)

❌ "explain the concept of" → WRONG (truncated)  
✅ "explain the concept of neural networks" → CORRECT (complete)

PUNCTUATION FIXES:
✅ "which detective would you want investigating a case for you" → "which detective would you want investigating a case for you?"
✅ "what is the capital of France" → "what is the capital of France?"

MATHEMATICS HANDLING - CRITICAL FOR STEM LECTURES:
When you detect spoken mathematics in the transcript, convert ALL mathematical expressions to proper LaTeX notation.
Wrap equations in $...$ for inline math or $$...$$ for display math (complex/centered equations).

SPOKEN MATH → LATEX CONVERSION PATTERNS:
- "limit as h approaches zero" → $\\lim_{h \\to 0}$
- "limit as x approaches infinity" → $\\lim_{x \\to \\infty}$
- "x plus h quantity squared" or "(x + h) squared" → $(x+h)^2$
- "all over h" or "divided by h" → use \\frac{numerator}{h}
- "x squared" → $x^2$
- "x cubed" → $x^3$
- "x to the n" or "x to the power n" → $x^n$
- "square root of x" → $\\sqrt{x}$
- "cube root of x" → $\\sqrt[3]{x}$
- "the integral from a to b" → $\\int_a^b$
- "the derivative of f" → $\\frac{df}{dx}$ or $f'(x)$
- "d y d x" or "dy dx" → $\\frac{dy}{dx}$
- "partial derivative" → $\\frac{\\partial f}{\\partial x}$
- "sum from n equals 1 to infinity" → $\\sum_{n=1}^{\\infty}$
- "product from" → $\\prod$
- "f of x" → $f(x)$
- "sine of x" / "sin x" → $\\sin(x)$
- "cosine" / "cos" → $\\cos$
- "tangent" / "tan" → $\\tan$
- "log of x" / "log x" → $\\log(x)$
- "natural log" / "ln" → $\\ln(x)$
- "e to the x" → $e^x$
- "pi" → $\\pi$
- "theta" → $\\theta$
- "alpha", "beta", "gamma", etc. → $\\alpha$, $\\beta$, $\\gamma$
- "infinity" → $\\infty$
- "plus or minus" → $\\pm$
- "not equal to" → $\\neq$
- "less than or equal to" → $\\leq$
- "greater than or equal to" → $\\geq$
- "approximately equal" → $\\approx$
- "vector x" → $\\vec{x}$
- "matrix" → use \\begin{matrix}...\\end{matrix}

EXAMPLE CONVERSIONS:
Spoken: "what is the limit as h approaches zero of x plus h quantity squared minus x squared all over h"
Output: "What is $\\lim_{h \\to 0} \\frac{(x+h)^2 - x^2}{h}$?"

Spoken: "find the derivative of x squared plus 3x"
Output: "Find the derivative of $x^2 + 3x$."

Spoken: "evaluate the integral from 0 to pi of sine x dx"
Output: "Evaluate $\\int_0^{\\pi} \\sin(x) \\, dx$."

Spoken: "what is the sum from n equals 1 to infinity of 1 over n squared"
Output: "What is $\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$?"

${difficultyInstruction}

If you cannot find a COMPLETE question, respond with exactly: NO_QUESTION_FOUND`;

    const userPrompt = `Extract the COMPLETE question from this transcript:

"""
${cleanedTranscript}
"""

The question is the main content in this transcript (voice commands have been removed).

Return ONLY the complete question text, nothing else.`;

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
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let extractedQuestion = data.choices[0]?.message?.content?.trim();

    console.log("🔍 Raw extraction result:", extractedQuestion);
    console.log("📊 Extraction length:", extractedQuestion?.length, "characters");

    // Apply auto-fixes BEFORE validation
    if (extractedQuestion) {
      // Trim any trailing ellipsis
      extractedQuestion = extractedQuestion.replace(/\.\.\.+$/, "").trim();

      // Auto-fix: Add question mark if question word present but no punctuation
      if (!extractedQuestion.endsWith("?") && !extractedQuestion.endsWith(".") && !extractedQuestion.endsWith("!")) {
        const lowerQ = extractedQuestion.toLowerCase();
        const hasQuestionWord = [
          "what",
          "how",
          "why",
          "which",
          "who",
          "when",
          "where",
          "can",
          "could",
          "would",
          "should",
          "is",
          "are",
          "do",
          "does",
        ].some((word) => lowerQ.startsWith(word + " "));

        if (hasQuestionWord) {
          console.log("🔧 Auto-adding question mark to complete question");
          extractedQuestion = extractedQuestion + "?";
        }
      }
    }

    // Strip HTML tags (AI sometimes includes markup)
    extractedQuestion = extractedQuestion.replace(/<[^>]*>/g, '').trim();

    // Strip YouTube UI text artifacts that leak into transcripts
    extractedQuestion = extractedQuestion
      .replace(/Show activity for more options\.?/gi, '')
      .replace(/Show more\.?/gi, '')
      .trim();

    // Remove duplicate trailing punctuation (e.g., "question??")
    extractedQuestion = extractedQuestion.replace(/([?.!])\1+$/, '$1');

    console.log("🔧 After auto-fix + sanitization:", extractedQuestion);

    // Enhanced validation with more aggressive truncation detection
    const validateQuestionCompleteness = (question: string): { isValid: boolean; reason?: string } => {
      if (!question || question.length < 5) {
        return { isValid: false, reason: "Question too short (< 5 chars)" };
      }

      // Check for incomplete endings
      if (question.endsWith("...") || question.endsWith("..")) {
        return { isValid: false, reason: "Question ends with ellipsis" };
      }

      // STRICT: Questions must end with proper punctuation
      if (!question.endsWith("?") && !question.endsWith(".") && !question.endsWith("!")) {
        return { isValid: false, reason: "Missing proper punctuation (?, ., !)" };
      }

      // Check for mid-word truncation
      if (/[a-z]$/.test(question) && !question.endsWith("?") && !question.endsWith(".") && !question.endsWith("!")) {
        return { isValid: false, reason: "Appears to be cut off mid-word" };
      }

      // Enhanced truncation pattern detection
      const truncationPatterns = [
        /\bwhat\s+does\s+(the|this|that)\s+\w+$/i, // "what does the death"
        /\bwhat\s+is\s+(the|this|that)\s+\w+$/i, // "what is the concept"
        /\bhow\s+does\s+(the|this|that)\s+\w+$/i, // "how does the system"
        /\bhow\s+do\s+(the|these|those)\s+\w+$/i, // "how do the elements"
        /\bwhy\s+is\s+(the|this|that)\s+\w+$/i, // "why is the approach"
        /\bwhy\s+does\s+(the|this|that)\s+\w+$/i, // "why does the method"
        /\bexplain\s+(the|this|that)\s+\w+$/i, // "explain the concept"
        /\bdescribe\s+(the|this|that)\s+\w+$/i, // "describe the process"
        /\bwhat\s+are\s+(the|these|those)\s+\w+$/i, // "what are the factors"
        /\bof\s+\w+$/i, // ends with "of something" (likely truncated)
      ];

      for (const pattern of truncationPatterns) {
        if (pattern.test(question)) {
          console.warn("⚠️ Detected truncation pattern:", pattern.source);
          return { isValid: false, reason: "Detected common truncation pattern - question appears incomplete" };
        }
      }

      // Check word count - very short questions are suspicious
      const wordCount = question.split(/\s+/).length;
      if (wordCount < 4 && (question.includes("what") || question.includes("how"))) {
        return { isValid: false, reason: `Question too short (${wordCount} words) for question word` };
      }

      return { isValid: true };
    };

    const validation = validateQuestionCompleteness(extractedQuestion);
    console.log("✔️ Validation result:", validation);
    if (!validation.isValid) {
      console.error("❌ Question failed completeness check:", validation.reason);
      console.error("   Extracted:", extractedQuestion);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Question extraction incomplete: ${validation.reason}. Please try again with a clearer question.`,
          partial_question: extractedQuestion,
          validation_failure: validation.reason,
          retryable: true,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cleanedQuestion = extractedQuestion;

    if (!cleanedQuestion || cleanedQuestion === "NO_QUESTION_FOUND") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not find a clear question in the recent transcript",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("✅ Extracted question:", cleanedQuestion);

    // Determine question type - RESPECT instructor preference
    const lowerQuestion = cleanedQuestion.toLowerCase();

    // Check for explicit coding indicators in the question
    const hasCodingKeywords =
      lowerQuestion.includes("code") ||
      lowerQuestion.includes("program") ||
      lowerQuestion.includes("function") ||
      lowerQuestion.includes("implement") ||
      lowerQuestion.includes("write a class") ||
      lowerQuestion.includes("create a class") ||
      lowerQuestion.includes("define a method");

    // Determine suggested type - INSTRUCTOR CODING PREFERENCE ALWAYS WINS
    let suggestedType: string;

    // PRIORITY 1: Instructor coding preference ALWAYS wins
    if (instructorPreference === "coding") {
      suggestedType = codingQuestionStyle === "simple" ? "coding_simple" : "coding";
      console.log(`🔧 Instructor prefers coding, forcing type: ${suggestedType}`);
    }
    // PRIORITY 2: Explicit coding keywords in question
    else if (hasCodingKeywords) {
      suggestedType = codingQuestionStyle === "simple" ? "coding_simple" : "coding";
      console.log(`🔧 Coding keywords detected, using style: ${suggestedType}`);
    }
    // PRIORITY 3: Use instructor preference (short_answer, multiple_choice, etc.)
    else {
      suggestedType = instructorPreference;
      console.log(`📝 Using instructor preference: ${suggestedType}`);
    }

    console.log(`📝 Final suggested type: ${suggestedType} (instructor pref: ${instructorPreference})`);

    return new Response(
      JSON.stringify({
        success: true,
        question_text: cleanedQuestion,
        suggested_type: suggestedType,
        extraction_method: "voice_command",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in extract-voice-command-question:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
