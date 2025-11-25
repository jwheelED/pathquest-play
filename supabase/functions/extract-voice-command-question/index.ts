import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { recentTranscript } = await req.json();

    if (!recentTranscript || recentTranscript.length < 10) {
      return new Response(JSON.stringify({ error: "No transcript provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🎤 Voice command triggered - extracting question from:", recentTranscript.substring(0, 100));
    console.log("📏 Full transcript length:", recentTranscript.length, "characters");

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

If you cannot find a COMPLETE question, respond with exactly: NO_QUESTION_FOUND`;

    const userPrompt = `Extract the COMPLETE question from this transcript:

"""
${recentTranscript}
"""

The question is RIGHT BEFORE phrases like "send question now", "send this", or "send it".

Return ONLY the complete question text, nothing else.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Stable model with good instruction following
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
          "what", "how", "why", "which", "who", "when", "where",
          "can", "could", "would", "should", "is", "are", "do", "does"
        ].some((word) => lowerQ.startsWith(word + " "));

        if (hasQuestionWord) {
          console.log("🔧 Auto-adding question mark to complete question");
          extractedQuestion = extractedQuestion + "?";
        }
      }
    }

    console.log("🔧 After auto-fix:", extractedQuestion);

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

    // Determine question type based on content
    let suggestedType = "multiple_choice";
    const lowerQuestion = cleanedQuestion.toLowerCase();

    if (
      lowerQuestion.includes("code") ||
      lowerQuestion.includes("program") ||
      lowerQuestion.includes("function") ||
      lowerQuestion.includes("implement")
    ) {
      suggestedType = "coding";
    } else if (
      lowerQuestion.includes("explain") ||
      lowerQuestion.includes("describe") ||
      lowerQuestion.includes("why") ||
      lowerQuestion.includes("how")
    ) {
      suggestedType = "short_answer";
    }

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
