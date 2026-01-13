import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Fallback questions when content is minimal
const FALLBACK_QUESTIONS = [
  {
    question_text: "Based on what was just discussed, what is the main concept you should remember?",
    suggested_type: "short_answer",
  },
  {
    question_text: "What key term or definition was mentioned in the last few minutes?",
    suggested_type: "short_answer",
  },
  {
    question_text: "Can you summarize the main point from the recent lecture content?",
    suggested_type: "short_answer",
  },
  {
    question_text: "What question do you have about what was just explained?",
    suggested_type: "short_answer",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "instructor",
    });

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized: Instructor role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      interval_transcript, 
      interval_minutes, 
      format_preference, 
      force_send, 
      materialContext = [],
      strict_mode = true,  // Default to strict mode (always guaranteed questions)
      retry_context = null, // Context from previously failed attempts
      slide_context = null, // Current slide text content
      difficulty_preference = 'easy', // Question difficulty: easy, medium, hard
      course_context = null, // Course title and topics for better question context
      coding_question_style = 'simple', // 'simple' for check-ins, 'full' for LeetCode-style
    } = await req.json();

    // Difficulty instructions for prompts
    const difficultyInstructions: Record<string, string> = {
      easy: "Generate an EASY question: Focus on basic recall, simple definitions, or straightforward facts. The answer should be directly stated in the content.",
      medium: "Generate a MEDIUM difficulty question: Require understanding and application of concepts. Students should need to think and apply knowledge.",
      hard: "Generate a HARD question: Require analysis, synthesis, or complex reasoning. Students should connect multiple concepts or apply to new situations."
    };

    const difficultyInstruction = difficultyInstructions[difficulty_preference] || difficultyInstructions.easy;

    // Build course context string for AI prompts
    let courseInfo = "";
    if (course_context?.title || (course_context?.topics && course_context.topics.length > 0)) {
      courseInfo = "COURSE CONTEXT:\n";
      if (course_context.title) {
        courseInfo += `Course: ${course_context.title}\n`;
      }
      if (course_context.topics?.length > 0) {
        courseInfo += `Key Topics: ${course_context.topics.join(", ")}\n`;
      }
      courseInfo += "Use this course context to ensure questions are relevant to the subject matter and use appropriate terminology.\n\n";
    }

    console.log(`📝 Generate interval question - strict_mode: ${strict_mode}, force_send: ${force_send}, difficulty: ${difficulty_preference}, slide_context: ${slide_context?.length || 0} chars, course: ${course_context?.title || 'none'}, coding_style: ${coding_question_style}`);

    // In strict mode, use very low minimum content requirements
    const minContentLength = strict_mode ? 10 : (force_send ? 25 : 100);

    // Combine retry context with current transcript if available
    let fullTranscript = interval_transcript || "";
    if (retry_context && retry_context.length > 0) {
      fullTranscript = retry_context.join("\n\n") + "\n\n" + fullTranscript;
      console.log(`📎 Combined retry context: ${retry_context.length} previous attempts + current`);
    }

    // Check if we have enough content from transcript OR slide context
    const hasSlideContext = slide_context && slide_context.trim().length > 20;
    const hasTranscript = fullTranscript && fullTranscript.length >= minContentLength;

    if (!hasTranscript && !hasSlideContext) {
      // In strict mode with no content at all, use a fallback question
      if (strict_mode) {
        console.log(`🔄 Strict mode: Using fallback question (transcript: ${fullTranscript?.length || 0} chars, slide: ${slide_context?.length || 0} chars)`);
        const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        return new Response(
          JSON.stringify({
            success: true,
            question_text: fallback.question_text,
            suggested_type: fallback.suggested_type,
            confidence: 0.5,
            reasoning: "Fallback question used due to minimal lecture content (strict mode)",
            is_fallback: true,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log(
        `⚠️ Not enough content: transcript ${fullTranscript?.length || 0}/${minContentLength} chars, slide ${slide_context?.length || 0} chars`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `Not enough content in interval (need ${minContentLength}+ chars)`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build context for question generation - prioritize slide content when available
    let primaryContext = "";
    let contextSource = "transcript";
    
    if (hasSlideContext) {
      primaryContext = `CURRENT SLIDE CONTENT:\n"${slide_context.trim()}"\n\n`;
      contextSource = "slide";
      if (hasTranscript) {
        primaryContext += `LECTURE AUDIO (last ${interval_minutes} minutes):\n"${fullTranscript}"\n\n`;
        contextSource = "slide+transcript";
      }
    } else {
      primaryContext = `LECTURE AUDIO (last ${interval_minutes} minutes):\n"${fullTranscript}"\n\n`;
    }

    console.log(
      `📝 Generating auto-question from ${contextSource} (transcript: ${fullTranscript.length} chars, slide: ${slide_context?.length || 0} chars)`,
    );
    console.log(`🎯 Format preference: ${format_preference || "multiple_choice"}`);

    // Different prompts based on format preference
    let prompt: string;

    if (format_preference === "coding") {
      if (coding_question_style === "simple") {
        // Simple check-in coding questions - quick conceptual prompts
        prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture on programming/computer science.

${courseInfo}${primaryContext}

TASK: Generate ONE SIMPLE, QUICK coding task that tests ONE concept from this content.

STYLE: Like a professor asking "Can you quickly write me a..."
- NOT a full problem with constraints/edge cases
- Just a direct prompt testing ONE specific concept  
- Should take 1-3 minutes to write
- Focus on demonstrating understanding, not perfection

GOOD EXAMPLES:
- "Write a function that returns the sum of all even numbers in a list"
- "Create a class with a constructor that takes name and age"
- "Write a loop that prints numbers 1 to N"
- "Implement a function to check if a string is a palindrome"
- "Write a recursive function to calculate factorial"

BAD EXAMPLES (too complex):
- Full algorithm problems with time/space complexity requirements
- Problems requiring multiple helper functions
- Problems with extensive edge case handling

Return JSON:
{
  "question_text": "Simple coding prompt (1-2 sentences, starts with 'Write...' or 'Create...' or 'Implement...')",
  "concept_tested": "The specific concept being tested (e.g., 'for loops', 'recursion', 'classes')",
  "language": "python" | "javascript" | "java" | "cpp" | "c",
  "suggested_type": "coding_simple",
  "confidence": 0.0-1.0,
  "reasoning": "why this tests a key concept from the lecture"
}

IMPORTANT: Keep it simple! The goal is to check if students understand the concept, not to challenge them with a hard problem.`;
      } else {
        // Full LeetCode-style coding problem generation
        prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture on programming/computer science.

${courseInfo}${primaryContext}

TASK: Generate ONE LeetCode-style coding problem based on the MOST IMPORTANT concept from this content.
${hasSlideContext ? "IMPORTANT: Prioritize the slide content - the question MUST directly test concepts shown on the current slide." : ""}

REQUIREMENTS:
1. Create a practical coding challenge that tests the key concept taught
2. Include proper problem structure with constraints and complexity requirements
3. Match the programming language being taught in the lecture
4. Make it solvable based on what was just covered
5. Appropriate difficulty for a lecture check-in (Easy to Medium level)
${hasSlideContext ? "6. The answer choices MUST be based on information visible in the slide" : ""}

Return JSON:
{
  "question_text": "Brief problem title (e.g., 'Character Frequency Counter')",
  "problemStatement": "Clear description of what to implement (2-4 sentences)",
  "functionSignature": "def function_name(params) -> return_type: or equivalent in detected language",
  "language": "python" | "javascript" | "java" | "cpp" | "c",
  "constraints": ["1 <= n <= 10^4", "Time: O(n)", "Space: O(1)", "Input contains only..."],
  "examples": [
    {"input": "example input", "output": "expected output", "explanation": "why this output"},
    {"input": "edge case input", "output": "expected output"}
  ],
  "hints": ["Hint 1 related to lecture content", "Hint 2 about approach"],
  "difficulty": "Easy" | "Medium",
  "suggested_type": "coding",
  "confidence": 0.0-1.0,
  "reasoning": "why this problem tests the key concept from lecture"
}

IMPORTANT: The problem should directly relate to concepts taught in the lecture segment. Extract the programming language from the lecture content.`;
      }
    } else {
      // Original prompt for multiple choice / short answer
      let materialsContext = "";
      if (materialContext && materialContext.length > 0) {
        materialsContext = "\nCOURSE MATERIALS FOR REFERENCE:\n";
        materialContext.forEach((material: any) => {
          materialsContext += `\n[${material.title}]\n`;
          if (material.description) {
            materialsContext += `Description: ${material.description}\n`;
          }
          materialsContext += `Content excerpt: ${material.content}\n`;
        });
        materialsContext += "\nUse these materials to provide additional context and ensure questions align with course content.\n";
      }

      // Special instructions when slide context is available
      const slideInstructions = hasSlideContext 
        ? `\nCRITICAL: The current slide content is the PRIMARY source for this question. 
- The question MUST directly test a concept, term, or fact visible on the current slide
- Answer choices for multiple choice MUST include the correct answer from the slide
- Do NOT create questions about topics NOT shown on the slide
- If the slide shows a definition, ask about that definition
- If the slide shows a formula, ask about that formula
- If the slide shows examples, ask about those specific examples`
        : "";

      prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture.

${courseInfo}${primaryContext}${materialsContext}${slideInstructions}

DIFFICULTY: ${difficultyInstruction}

TASK: Generate ONE high-quality question that:
1. Tests the MOST IMPORTANT concept from this content
2. Is clearly answerable based on what was just taught
3. Matches the specified difficulty level
4. Avoids trivial or overly specific details
${hasSlideContext ? "5. DIRECTLY relates to content visible on the current slide" : "5. Focus on the lecture content"}

CRITERIA:
- Focus on main concepts, not minor details
- Question should be fair and clear
- Match the difficulty level specified above
${hasSlideContext ? "- Answer choices MUST include correct information from the slide" : "- Avoid questions about examples unless they're core to understanding"}
- MUST generate a valid question even if content seems limited
- For short_answer questions: ALWAYS include an expected_answer that captures the key concepts a correct response should contain
- For multiple_choice questions: ALWAYS include options (array of 4 choices) and correct_answer (A, B, C, or D)

Return JSON based on question type:

For multiple_choice:
{
  "question_text": "the question",
  "suggested_type": "multiple_choice",
  "options": ["A. first option", "B. second option", "C. third option", "D. fourth option"],
  "correct_answer": "A" | "B" | "C" | "D",
  "explanation": "Brief explanation of why the correct answer is right",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}

For short_answer:
{
  "question_text": "the question",
  "suggested_type": "short_answer",
  "expected_answer": "the ideal/correct answer (1-3 sentences) capturing key concepts",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}`;
    }

    // Add timeout handling (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-pro-preview",
          messages: [
            {
              role: "system",
              content:
                "You are an educational AI that generates high-quality lecture check-in questions. Return ONLY valid JSON, no markdown formatting. NEVER truncate questions mid-sentence. Always generate a question even if content seems limited. When slide content is provided, prioritize generating questions that test concepts directly from the slide.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        // In strict mode, return fallback on timeout
        if (strict_mode) {
          console.log("⏱️ Timeout in strict mode - using fallback");
          const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
          return new Response(
            JSON.stringify({
              success: true,
              question_text: fallback.question_text,
              suggested_type: fallback.suggested_type,
              confidence: 0.4,
              reasoning: "Fallback question used due to AI timeout (strict mode)",
              is_fallback: true,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: "AI request timed out after 30 seconds",
          }),
          {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);

      // In strict mode, return fallback on API errors
      if (strict_mode && (response.status === 429 || response.status >= 500)) {
        console.log(`🔄 Strict mode: Using fallback due to API error ${response.status}`);
        const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        return new Response(
          JSON.stringify({
            success: true,
            question_text: fallback.question_text,
            suggested_type: fallback.suggested_type,
            confidence: 0.4,
            reasoning: `Fallback question used due to API error (strict mode)`,
            is_fallback: true,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      let errorMessage = "Failed to generate question from AI";
      if (response.status === 429) {
        errorMessage = "AI service rate limit exceeded. Please try again in a moment.";
      } else if (response.status === 402) {
        errorMessage = "AI service quota exceeded. Please add credits to your workspace.";
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          status_code: response.status,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Defensive JSON parsing - handle empty/truncated responses
    let aiResponse;
    try {
      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response body from AI API");
      }
      aiResponse = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("❌ Failed to parse AI API response:", jsonError);
      
      // In strict mode, use fallback on empty/malformed response
      if (strict_mode) {
        console.log("🔄 Strict mode: Using fallback due to malformed API response");
        const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        return new Response(
          JSON.stringify({
            success: true,
            question_text: fallback.question_text,
            suggested_type: fallback.suggested_type,
            confidence: 0.4,
            reasoning: "Fallback question used due to API response parsing error (strict mode)",
            is_fallback: true,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to parse AI API response",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate expected response structure
    if (!aiResponse?.choices?.[0]?.message?.content) {
      console.error("❌ Unexpected AI response structure:", JSON.stringify(aiResponse).substring(0, 200));
      
      if (strict_mode) {
        console.log("🔄 Strict mode: Using fallback due to unexpected response structure");
        const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        return new Response(
          JSON.stringify({
            success: true,
            question_text: fallback.question_text,
            suggested_type: fallback.suggested_type,
            confidence: 0.4,
            reasoning: "Fallback question used due to unexpected API response structure (strict mode)",
            is_fallback: true,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unexpected AI response structure",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let content = aiResponse.choices[0].message.content;

    // Enhanced JSON parsing with markdown cleanup
    content = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse failed, content:", content);
      // Fallback: try to extract JSON from text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // In strict mode, use fallback on parse failure
        if (strict_mode) {
          console.log("🔄 Strict mode: Using fallback due to JSON parse error");
          const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
          return new Response(
            JSON.stringify({
              success: true,
              question_text: fallback.question_text,
              suggested_type: fallback.suggested_type,
              confidence: 0.4,
              reasoning: "Fallback question used due to response parsing error (strict mode)",
              is_fallback: true,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to parse AI response",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Log raw response for debugging
    console.log("📦 Raw AI response parsed:", JSON.stringify(result).substring(0, 500));

    // Normalize question_text field - AI might return "question" instead of "question_text"
    if (result.question && !result.question_text) {
      console.log("🔄 Normalizing field: result.question -> result.question_text");
      result.question_text = result.question;
    }

    // For non-coding questions, validate that question_text exists
    if (format_preference !== "coding") {
      const questionText = result.question_text;
      
      if (!questionText || (typeof questionText === "string" && questionText.trim().length === 0)) {
        console.error("❌ AI response missing question_text:", JSON.stringify(result).substring(0, 300));
        
        if (strict_mode) {
          console.log("🔄 Strict mode: Using fallback due to missing question field");
          const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
          return new Response(
            JSON.stringify({
              success: true,
              question_text: fallback.question_text,
              suggested_type: fallback.suggested_type,
              confidence: 0.4,
              reasoning: "Fallback question used due to malformed AI response (strict mode)",
              is_fallback: true,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: "AI response missing required question_text field",
            raw_response: result,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    console.log("✅ Auto-question generated:", result.question_text);
    console.log("📊 Confidence:", result.confidence, "| Reasoning:", result.reasoning, "| Source:", contextSource);

    // Validate question completeness before checking confidence
    if (typeof result.question_text === "string") {
      const questionLength = result.question_text.trim().length;
      const endsWithQuestionMark = result.question_text.trim().endsWith("?");
      const wordCount = result.question_text.trim().split(/\s+/).length;

      console.log("📏 Question stats:", {
        length: questionLength,
        wordCount: wordCount,
        endsWithQuestionMark: endsWithQuestionMark,
      });

      // Red flags for truncation - but in strict mode, still try to send
      if (questionLength < 10) {
        if (strict_mode) {
          console.log("⚠️ Question too short in strict mode - using fallback");
          const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
          return new Response(
            JSON.stringify({
              success: true,
              question_text: fallback.question_text,
              suggested_type: fallback.suggested_type,
              confidence: 0.4,
              reasoning: "Fallback question used due to truncated AI response (strict mode)",
              is_fallback: true,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        console.log("⚠️ Question too short (likely truncated)");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Generated question is too short (possible truncation)",
            question_text: result.question_text,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // In strict mode, skip confidence threshold entirely - always send a question
    if (!strict_mode) {
      const confidenceThreshold = force_send ? 0.1 : 0.3;
      if (result.confidence < confidenceThreshold) {
        console.log(`⚠️ Confidence too low (${result.confidence} < ${confidenceThreshold}), skipping auto-question`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Generated question did not meet confidence threshold",
            confidence: result.confidence,
            question_text: result.question_text,
            reasoning: result.reasoning,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (result.confidence < 0.3) {
      console.log(`🔥 Strict mode: Accepting low confidence question (${result.confidence})`);
    }

    // Return appropriate structure based on format
    if (format_preference === "coding") {
      // Preserve the AI's suggested_type (coding_simple vs coding) or detect from style
      const suggestedType = result.suggested_type || 
        (coding_question_style === "simple" ? "coding_simple" : "coding");
      
      return new Response(
        JSON.stringify({
          success: true,
          question_text: result,
          suggested_type: suggestedType,
          confidence: result.confidence,
          reasoning: result.reasoning,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else {
      // Include MCQ options if available (for preview editing)
      const responseData: any = {
        success: true,
        question_text: result.question_text,
        suggested_type: result.suggested_type,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
      
      // Add MCQ-specific fields if this is a multiple choice question
      if (result.suggested_type === "multiple_choice") {
        if (result.options && Array.isArray(result.options)) {
          responseData.options = result.options;
        }
        if (result.correct_answer) {
          responseData.correct_answer = result.correct_answer;
        }
        if (result.explanation) {
          responseData.explanation = result.explanation;
        }
      }
      
      // Add expected_answer for short answer questions
      if (result.suggested_type === "short_answer" && result.expected_answer) {
        responseData.expected_answer = result.expected_answer;
      }
      
      return new Response(
        JSON.stringify(responseData),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error in generate-interval-question:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});