import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callClaude } from "../_shared/anthropic.ts";
import { summarizeDelivery } from "../_shared/deliveryVerification.ts";
import { initSentry } from "../_shared/sentry.ts";
import { createLogger } from "../_shared/log.ts";

// Initialize Sentry once at cold start (no-op unless SENTRY_DSN is set).
initSentry();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Shuffle MCQ options so the correct answer isn't always A
// Uses index tracking instead of indexOf to handle duplicate option text correctly
const shuffleMCQOptions = (mcq: { question: string; options: string[]; correctAnswer: string; explanation: string }) => {
  if (!mcq?.options || mcq.options.length !== 4 || !mcq.correctAnswer) return mcq;

  const letters = ['A', 'B', 'C', 'D'];
  const correctIdx = letters.indexOf(mcq.correctAnswer.trim().toUpperCase());
  if (correctIdx === -1) return mcq;

  // Strip letter prefixes and track which index is correct
  const augmented = mcq.options.map((opt, i) => ({
    text: opt.replace(/^[A-D][\).\-\s]+\s*/i, '').trim(),
    wasCorrect: i === correctIdx,
  }));

  // Check for duplicate option text — skip shuffle if found
  const uniqueTexts = new Set(augmented.map(o => o.text.toLowerCase()));
  if (uniqueTexts.size < 4) {
    console.warn('⚠️ Duplicate MCQ options detected — skipping shuffle to preserve correctAnswer mapping');
    return mcq;
  }

  // Fisher-Yates shuffle
  for (let i = augmented.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [augmented[i], augmented[j]] = [augmented[j], augmented[i]];
  }

  // Find where the correct answer ended up via tracked flag
  const newCorrectIdx = augmented.findIndex(o => o.wasCorrect);
  if (newCorrectIdx === -1) {
    console.error('🚫 Shuffle tracking failed — returning unshuffled');
    return mcq;
  }

  const newCorrectLetter = letters[newCorrectIdx];

  // Re-prefix with letters
  const newOptions = augmented.map((o, i) => `${letters[i]}. ${o.text}`);

  console.log(`🔀 Shuffled MCQ: correct answer moved from ${mcq.correctAnswer} → ${newCorrectLetter}`);

  return {
    ...mcq,
    options: newOptions,
    correctAnswer: newCorrectLetter,
  };
};

const generateMCQ = async (
  questionText: string,
  context: string,
  courseContext?: { title: string; topics: string[] } | null,
) => {
  // Build course context for prompt
  let courseInfo = "";
  if (courseContext?.title) {
    courseInfo += `\nCourse: ${courseContext.title}`;
  }
  if (courseContext?.topics?.length) {
    courseInfo += `\nRelevant topics: ${courseContext.topics.join(", ")}`;
  }

  const mathGuidance = `

MATH FORMATTING - CRITICAL:
Do NOT use LaTeX syntax. No $, \\frac, \\int, {, }, or backslash commands.
Write all math as plain readable text using Unicode:
- Fractions: a/b, cos x / sin x (never \\frac)
- Integrals: ∫(a to b) f(x) dx
- Square roots: √x, √(x+1)
- Exponents: x², x³, e^(x²)
- Greek letters: π, θ, α, β
- Derivatives: d/dx, d²/dx², f'(x), dy/dx
- Limits: lim(h→0), lim(x→∞)
- Summation: Σ(n=1 to ∞) 1/n²
- Multiplication: · or juxtapose
- Apply to question AND all answer options`;

  const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `Today's date is ${todayStr}.

=== TEACHING CONTEXT (everything the instructor has said recently — may include EARLIER LECTURE HISTORY and MOST RECENT TEACHING sections) ===
"${context}"

=== INSTRUCTOR'S QUESTION (what to turn into a check-in) ===
"${questionText}"

INSTRUCTIONS:
- The TEACHING CONTEXT is the running transcript of what the instructor has been saying. It may span 60+ seconds of speech and contain multiple topics.
- The INSTRUCTOR'S QUESTION is the short prompt the instructor just asked the class. It is often vague and contains pronouns ("it", "this", "they", "that") whose antecedents appear EARLIER in the teaching context — sometimes many sentences back.
- BEFORE generating the MCQ, scan the ENTIRE teaching context (not just the last sentence) to find what the pronouns refer to. Look at concrete nouns, named concepts, and the most prominent subject discussed.
  Example: question "what does it produce?" + context "...we covered the cell. The mitochondria converts glucose into energy. Now class..."
           → "it" = the mitochondria → resolved question: "What does the mitochondria produce?"
- Generate the check-in based on the RESOLVED, fully-specified question, grounded in the teaching context.
- If after scanning the full context the pronoun still has no clear antecedent, base the question on the MOST PROMINENT concept in the teaching context.
${courseInfo}${mathGuidance}

ANSWER RULES:
- If the lecture context explicitly provides the answer, use it.
- If the question is time-sensitive and asks for a CURRENT fact not explicitly given in the lecture, do NOT confidently answer from possibly outdated model memory.
- For those CURRENT questions, make the correct answer a verification-safe option such as "Needs current verification" and explain that current sources should be checked.
- Never confidently provide a possibly outdated officeholder, champion, price, or other current status.
- Use the lecture context to craft relevant, plausible distractors when available.
- Never generate an option like "was not mentioned in the lecture" or similar non-answers.

Generate a multiple choice question with 4 options:
- One correct answer
- Three plausible distractors based on common misconceptions${courseContext?.title ? ` in ${courseContext.title}` : ""} and typical errors
- IMPORTANT: Randomize which option (A, B, C, or D) is correct - don't always make A correct
- Match the difficulty to what was just taught
- Keep it concise and clear
- Use plain Unicode math notation (no LaTeX)
${courseContext?.topics?.length ? `- Consider these key topics when creating distractors: ${courseContext.topics.join(", ")}` : ""}

Each distractor should represent a specific type of error a student might make.

Return JSON with options formatted as "A. text", "B. text", "C. text", "D. text":
{
  "question": "the resolved question text (use plain Unicode math, no LaTeX)",
  "options": ["A. first option text", "B. second option text", "C. third option text", "D. fourth option text"],
  "correctAnswer": "A" | "B" | "C" | "D",
  "explanation": "Why this is correct and explain what mistakes lead to each wrong answer"
}`;

  // Add timeout handling (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await callClaude({
      messages: [
        {
          role: "system",
          content:
            "You are an educational AI that creates high-quality multiple choice questions. If a question asks for a CURRENT time-sensitive fact that is not explicitly provided in the lecture context, do NOT guess from stale memory. Use a verification-safe correct answer instead and explain that current sources should be checked. Return ONLY valid JSON, no markdown formatting.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error("AI service rate limit exceeded. Please try again in a moment.");
      }
      if (response.status === 402) {
        throw new Error("AI service quota exceeded. Please add credits to your workspace.");
      }
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices[0].message.content;

    // Enhanced JSON parsing with markdown cleanup
    content = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      const parsed = JSON.parse(content);
      return shuffleMCQOptions(parsed);
    } catch (parseError) {
      console.error("JSON parse failed, content:", content);
      // Fallback: try to extract JSON from text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return shuffleMCQOptions(parsed);
      }
      throw new Error("Failed to parse AI response as JSON");
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("AI request timed out after 30 seconds. Please try again.");
    }
    throw error;
  }
};

const generateCodingQuestion = async (
  questionText: string,
  context: string,
  courseContext?: { title: string; topics: string[] } | null,
) => {
  // Build course context for prompt
  let courseInfo = "";
  if (courseContext?.title) {
    courseInfo += `\nCourse: ${courseContext.title}`;
  }
  if (courseContext?.topics?.length) {
    courseInfo += `\nRelevant topics: ${courseContext.topics.join(", ")}`;
  }

  const prompt = `Based on the lecture content, create a LeetCode-style coding problem.

=== TEACHING CONTEXT (background — earlier in the lecture) ===
"${context}"

=== INSTRUCTOR'S QUESTION/TOPIC (what to turn into a check-in) ===
"${questionText}"${courseInfo}

INSTRUCTIONS:
- The TEACHING CONTEXT is background information the instructor already covered.
- The INSTRUCTOR'S QUESTION/TOPIC is the short prompt the instructor just asked.
- Resolve any pronouns (it, this, they, that) in the question using the teaching context BEFORE generating the problem.
- Generate the coding challenge based on the RESOLVED question, grounded strictly in the teaching context.

Generate a professional coding challenge with this EXACT JSON structure:

{
  "title": "Brief descriptive title (2-4 words)",
  "difficulty": "Easy" | "Medium" | "Hard",
  "problemStatement": "Clear, comprehensive description of the problem (3-5 sentences). Explain what needs to be implemented and any important details.",
  "functionSignature": "def function_name(param1: type1, param2: type2) -> return_type:",
  "language": "python" | "javascript" | "java" | "cpp" | "c",
  "constraints": [
    "1 <= n <= 10^4",
    "Array contains only integers",
    "Time Complexity: O(n)",
    "Space Complexity: O(1)"
  ],
  "examples": [
    {
      "input": "concrete example input",
      "output": "expected output",
      "explanation": "step-by-step why this is the answer"
    },
    {
      "input": "edge case example",
      "output": "expected output"
    }
  ],
  "hints": [
    "Consider using a specific data structure from lecture",
    "Think about the algorithm discussed in class"
  ],
  "starterCode": "# Function template with parameters and docstring\\ndef function_name(params):\\n    \\"\\"\\"\\n    Write your solution here\\n    \\"\\"\\"\\n    pass",
  "testCases": [
    {"input": "test input 1", "expectedOutput": "output 1"},
    {"input": "test input 2", "expectedOutput": "output 2"},
    {"input": "edge case", "expectedOutput": "edge output"}
  ]
}

CRITICAL REQUIREMENTS:
1. Detect the programming language from the lecture context
2. Match the difficulty to what was just taught (usually Easy or Medium for lecture check-ins)
3. Make constraints realistic and include Big-O complexity expectations
4. Provide at least 2 examples with clear explanations
5. Include 2-3 hints that reference lecture concepts
6. Starter code should match the detected language syntax
7. Problem should be solvable based on lecture content
8. GROUNDING: The problem MUST be based on concepts from the TEACHING CONTEXT above. Do NOT introduce algorithms, data structures, or topics not discussed in the lecture.`;

  // Add timeout handling (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await callClaude({
      messages: [
        {
          role: "system",
          content:
            "You are an educational AI that creates coding challenges grounded strictly in the provided lecture content. You MUST NOT introduce algorithms, data structures, or concepts not discussed in the lecture. Return ONLY valid JSON, no markdown formatting.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error("AI service rate limit exceeded. Please try again in a moment.");
      }
      if (response.status === 402) {
        throw new Error("AI service quota exceeded. Please add credits to your workspace.");
      }
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices[0].message.content;

    // Enhanced JSON parsing with markdown cleanup
    content = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse failed, content:", content);
      // Fallback: try to extract JSON from text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Failed to parse AI response as JSON");
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("AI request timed out after 30 seconds. Please try again.");
    }
    throw error;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // First verify authentication with anon key
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

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
    } = await supabaseAnon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabaseAnon.rpc("has_role", {
      _user_id: user.id,
      _role: "instructor",
    });

    if (roleError) {
      console.error("Role check failed:", roleError);
      return new Response(
        JSON.stringify({
          error: "Authorization check failed",
          details: roleError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized: Instructor role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // After authentication verified, use service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check when last question was sent (minimum 60 second gap)
    const { data: lastQuestion } = await supabase
      .from("student_assignments")
      .select("created_at")
      .eq("instructor_id", user.id)
      .eq("assignment_type", "lecture_checkin")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastQuestion) {
      const timeSinceLastQuestion = Date.now() - new Date(lastQuestion.created_at).getTime();
      if (timeSinceLastQuestion < 5000) {
        // 5 seconds
        const retryAfter = Math.ceil((5000 - timeSinceLastQuestion) / 1000);
        console.log(`⏳ Rate limit: ${retryAfter}s until next question`);
        return new Response(
          JSON.stringify({
            error: "Please wait 5 seconds between questions",
            error_type: "cooldown",
            retry_after: retryAfter,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Fetch instructor's custom daily limit
    const { data: instructorProfile } = await supabase
      .from("profiles")
      .select("daily_question_limit, org_id")
      .eq("id", user.id)
      .single();

    const dailyLimit = instructorProfile?.daily_question_limit || 200;
    const instructorOrgId = instructorProfile?.org_id || null;
    console.log(`📊 Daily limit for instructor: ${dailyLimit}`);

    // Check daily limit (custom per instructor)
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("student_assignments")
      .select("id", { count: "exact", head: true })
      .eq("instructor_id", user.id)
      .eq("assignment_type", "lecture_checkin")
      .gte("created_at", today);

    if (count && count >= dailyLimit) {
      console.log("🚫 Daily question limit reached");
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const hoursUntilReset = Math.floor((midnight.getTime() - now.getTime()) / (1000 * 60 * 60));
      const minutesUntilReset = Math.floor(((midnight.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));

      return new Response(
        JSON.stringify({
          error: "Daily question limit reached",
          error_type: "daily_limit",
          current_count: count,
          daily_limit: dailyLimit,
          quota_reset: "midnight UTC",
          hours_until_reset: hoursUntilReset,
          minutes_until_reset: minutesUntilReset,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const {
      question_text,
      suggested_type,
      context,
      prior_context = null, // Optional focused teaching prose from trigger pipeline (preferred when present)
      source = "manual_button",
      use_answer_key = false,
      course_context = null,
      expected_answer = "",
      options = null,
      correct_answer = null,
      explanation = null,
      course_id = null,
      source_transcript = null, // Raw transcript to display with question
      coding_payload = null, // Pre-generated/edited coding question from on-deck preview
    } = await req.json();

    // Normalize coding_payload (may arrive as {style:'simple'|'full', ...fields})
    const hasCodingPayload = coding_payload && typeof coding_payload === "object";
    const codingPayloadStyle = hasCodingPayload
      ? (coding_payload.style === "full" ? "full" : coding_payload.style === "simple" ? "simple" : null)
      : null;

    // ALWAYS combine the broad transcript tail (context) with the focused trigger prior_context.
    // The broad tail provides earlier-lecture history needed to resolve vague references like
    // "what does it produce?" to antecedents mentioned 15-60s ago. The focused prior_context
    // (when present) highlights the teaching prose immediately before the question.
    // Sending BOTH gives Gemini the richest possible window for pronoun resolution.
    const broadContext: string = typeof context === "string" ? context : "";
    const focusedContext: string = typeof prior_context === "string" ? prior_context.trim() : "";

    let effectiveContext: string;
    if (focusedContext && broadContext) {
      // Combine: broad history first, then focused recent prose (highlighted as most recent)
      effectiveContext =
        `[EARLIER LECTURE HISTORY]\n${broadContext}\n\n[MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]\n${focusedContext}`;
    } else if (focusedContext) {
      effectiveContext = focusedContext;
    } else {
      effectiveContext = broadContext;
    }
    console.log(
      `📥 Context assembled: broad=${broadContext.length} chars, focused=${focusedContext.length} chars, total=${effectiveContext.length} chars`
    );

    // Fetch instructor's question format preference and auto-grading settings
    const { data: profileData } = await supabase
      .from("profiles")
      .select("question_format_preference, auto_grade_short_answer, auto_grade_coding, auto_grade_mcq")
      .eq("id", user.id)
      .single();

    const instructorPreference = profileData?.question_format_preference || "multiple_choice";
    console.log("📋 Instructor preference:", instructorPreference);

    // Auto-grading preferences
    const autoGradePrefs = {
      short_answer: profileData?.auto_grade_short_answer || false,
      coding: profileData?.auto_grade_coding || false,
      mcq: profileData?.auto_grade_mcq !== false, // Default to true
    };

    // Determine assignment mode based on question type and preferences
    // CRITICAL: coding_simple ALWAYS auto-grades - it's designed for quick conceptual checks
    const getAssignmentMode = (questionType: string): string => {
      // coding_simple ALWAYS uses auto-grade regardless of instructor preference
      if (questionType === "coding_simple") return "auto_grade";
      if (questionType === "multiple_choice" && autoGradePrefs.mcq) return "auto_grade";
      if (questionType === "short_answer" && autoGradePrefs.short_answer) return "auto_grade";
      if (questionType === "coding" && autoGradePrefs.coding) return "auto_grade";
      return "manual_grade";
    };

    // Normalize suggested_type aliases so downstream logic is consistent.
    // The ReviewModal sends 'mcq' and 'poll'; the edge function uses 'multiple_choice'.
    const normalizeSuggestedType = (t: string | undefined | null): string | undefined => {
      if (!t) return undefined;
      if (t === 'mcq') return 'multiple_choice';
      return t;
    };
    const normalizedSuggestedType = normalizeSuggestedType(suggested_type);

    // Determine final question type with smart priority:
    // 1. If pre-generated options provided (from preview dialog editing), respect the suggested_type
    // 2. If instructor prefers coding, use their coding style preference (simple vs full)
    // 3. Otherwise, use instructor's preference from settings
    // This ensures preview dialog overrides work, voice commands respect settings, and coding style is handled
    //
    // For MCQ: require options with a correct_answer.
    // For poll: require options (no correct_answer needed).
    const hasMCQOptions = options && Array.isArray(options) && options.length >= 2 && correct_answer;
    const hasPollOptions = options && Array.isArray(options) && options.length >= 2;
    const hasPreGeneratedOptions = normalizedSuggestedType === 'poll' ? hasPollOptions : hasMCQOptions;

    let finalType: string;

    if (hasCodingPayload && codingPayloadStyle) {
      // Instructor pre-generated/edited coding question from on-deck preview - respect it
      finalType = codingPayloadStyle === "simple" ? "coding_simple" : "coding";
      console.log(`🔧 Using pre-edited coding payload, type: ${finalType}`);
    } else if (hasPreGeneratedOptions && normalizedSuggestedType) {
      // Preview dialog with edited options - respect user's explicit choice
      finalType = normalizedSuggestedType;
      console.log(`📝 Using preview dialog type: ${finalType}`);
    } else if (normalizedSuggestedType === 'poll' && hasPollOptions) {
      // Poll with pre-generated options but no correct_answer (polls are ungraded)
      finalType = 'poll';
      console.log(`📝 Using poll type from preview dialog`);
    } else if (normalizedSuggestedType === 'short_answer' && (expected_answer || !hasPreGeneratedOptions)) {
      // Instructor explicitly chose short answer in preview dialog - respect it
      // Don't override with instructor's default preference
      finalType = 'short_answer';
      console.log(`📝 Respecting explicit short_answer type from preview dialog`);
    } else if (instructorPreference === "coding") {
      // When instructor prefers coding, fetch their coding style and use it
      const { data: codingPref } = await supabase
        .from("profiles")
        .select("coding_question_style")
        .eq("id", user.id)
        .single();

      const codingStyle = codingPref?.coding_question_style || "simple";
      // Map coding preference to finalType - suggested_type can override if already coding
      if (suggested_type === "coding" || suggested_type === "coding_simple") {
        finalType = suggested_type;
      } else {
        finalType = codingStyle === "simple" ? "coding_simple" : "coding";
      }
      console.log(`🔧 Instructor prefers coding (style: ${codingStyle}), forcing type: ${finalType}`);
    } else {
      // For non-coding preferences, use instructor preference
      finalType = instructorPreference;
      console.log(`📝 Using instructor preference: ${finalType}`);
    }

    console.log(
      `📝 Final question type: ${finalType} (preference: ${instructorPreference}, suggested: ${suggested_type}, has_preview_options: ${hasPreGeneratedOptions})`,
    );

    if (!question_text || !suggested_type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ANSWER KEY MATCHING ===
    // Check if instructor wants to use answer key MCQs and has verified problems
    let answerKeyMcq: any = null;
    if (use_answer_key && context && instructorPreference === "multiple_choice") {
      console.log("🔑 Checking for answer key match...");

      try {
        // Get instructor's verified problems with MCQs
        const { data: answerKeys } = await supabase
          .from("instructor_answer_keys")
          .select("id")
          .eq("instructor_id", user.id)
          .eq("status", "parsed");

        if (answerKeys && answerKeys.length > 0) {
          const answerKeyIds = answerKeys.map((k) => k.id);

          // Get verified problems with their MCQs
          const { data: problems } = await supabase
            .from("answer_key_problems")
            .select(
              `
              id,
              problem_text,
              final_answer,
              keywords,
              topic_tags,
              answer_key_mcqs (
                id,
                question_text,
                correct_answer,
                distractors,
                explanation
              )
            `,
            )
            .in("answer_key_id", answerKeyIds)
            .eq("verified_by_instructor", true);

          if (problems && problems.length > 0) {
            // Simple keyword matching against context
            const contextLower = context.toLowerCase();
            let bestMatch: any = null;
            let bestScore = 0;

            for (const problem of problems) {
              const keywords = problem.keywords || [];
              const tags = problem.topic_tags || [];
              const allTerms = [...keywords, ...tags];

              let matchCount = 0;
              for (const term of allTerms) {
                if (contextLower.includes(term.toLowerCase())) {
                  matchCount++;
                }
              }

              // Also check if problem text appears in context
              const problemWords = problem.problem_text
                .toLowerCase()
                .split(/\s+/)
                .filter((w: string) => w.length > 4);
              for (const word of problemWords.slice(0, 5)) {
                if (contextLower.includes(word)) {
                  matchCount += 0.5;
                }
              }

              const score = allTerms.length > 0 ? matchCount / allTerms.length : 0;

              if (score > bestScore && score >= 0.3 && (problem as any).answer_key_mcqs?.length > 0) {
                bestScore = score;
                bestMatch = problem;
              }
            }

            if (bestMatch && (bestMatch as any).answer_key_mcqs?.[0]) {
              const mcq = (bestMatch as any).answer_key_mcqs[0];
              answerKeyMcq = {
                question: mcq.question_text,
                correctAnswer: mcq.correct_answer,
                options: mcq.distractors,
                explanation: mcq.explanation,
                problemId: bestMatch.id,
                mcqId: mcq.id,
                confidence: bestScore,
              };
              console.log(`✅ Answer key match found! Confidence: ${(bestScore * 100).toFixed(0)}%`);

              // Log usage
              await supabase.from("answer_key_usage_log").insert({
                instructor_id: user.id,
                problem_id: bestMatch.id,
                mcq_id: mcq.id,
                session_id: null,
                transcript_snippet: context.substring(0, 500),
                match_confidence: bestScore,
                match_keywords: bestMatch.keywords?.filter((k: string) => contextLower.includes(k.toLowerCase())) || [],
              });
            }
          }
        }
      } catch (matchError) {
        console.error("Answer key matching error:", matchError);
        // Continue with AI generation if matching fails
      }
    }

    // Handle logging for both string and object question_text
    const questionPreview =
      typeof question_text === "string"
        ? question_text.substring(0, 50)
        : question_text.question_text || question_text.title || "Structured problem";

    console.log("📝 Formatting question as:", finalType, "-", questionPreview);

    let formattedQuestion: any;

    // Performance logging: Track formatting time
    let formatStartTime = Date.now();
    console.log("⏱️ Starting question formatting...");

    if (finalType === "coding" || finalType === "coding_simple") {
      const isSimpleCoding = finalType === "coding_simple";

      if (hasCodingPayload && isSimpleCoding) {
        // Pre-generated simple check-in from on-deck preview - use as-is
        console.log("📝 Using pre-generated simple coding payload");
        formattedQuestion = {
          question:
            typeof question_text === "string"
              ? question_text
              : (question_text?.question_text || String(question_text)),
          type: "coding_simple",
          language: coding_payload.language || "python",
          difficulty: "Easy",
          functionSignature: "",
          constraints: [],
          examples: [],
          hints: ["Focus on demonstrating the concept - minor syntax errors are okay!"],
          starterCode: "",
          testCases: [],
          expectedAnswer: coding_payload.expected_answer || expected_answer || "",
          gradingMode: "auto_grade", // simple check-ins always auto-grade
        };
      } else if (hasCodingPayload && !isSimpleCoding) {
        // Pre-generated full LeetCode-style payload from on-deck preview
        console.log("📝 Using pre-generated full coding payload");
        formattedQuestion = {
          title: coding_payload.title || (typeof question_text === "string" ? question_text : ""),
          question: coding_payload.problemStatement || (typeof question_text === "string" ? question_text : ""),
          type: "coding",
          language: coding_payload.language || "python",
          difficulty: coding_payload.difficulty || "Medium",
          functionSignature: coding_payload.functionSignature || "",
          constraints: coding_payload.constraints || [],
          examples: coding_payload.examples || [],
          hints: coding_payload.hints || [],
          starterCode: coding_payload.starterCode || "",
          testCases: coding_payload.testCases || [],
          expectedAnswer: "",
          gradingMode: autoGradePrefs.coding ? "auto_grade" : "manual_grade",
        };
      } else if (isSimpleCoding) {
        // Simple coding check-in - minimal structure, just show mini IDE with the question
        console.log("📝 Creating simple coding check-in (mini IDE)");
        formattedQuestion = {
          question:
            typeof question_text === "string"
              ? question_text
              : question_text.question_text || question_text.problemStatement || String(question_text),
          type: "coding_simple",
          language: "python", // Default to python for simple check-ins
          difficulty: "Easy",
          functionSignature: "",
          constraints: [],
          examples: [],
          hints: ["Focus on demonstrating the concept - minor syntax errors are okay!"],
          starterCode: "",
          testCases: [],
          expectedAnswer: expected_answer || "",
          gradingMode: autoGradePrefs.coding ? "auto_grade" : "manual_grade",
        };
      } else if (
        question_text &&
        typeof question_text === "object" &&
        "problemStatement" in question_text &&
        "constraints" in question_text
      ) {
        // Structured LeetCode-style problem from generate-interval-question
        const codingProblem = question_text as any;
        formattedQuestion = {
          title: codingProblem.title || codingProblem.question_text,
          question: codingProblem.problemStatement,
          type: "coding",
          language: codingProblem.language || "python",
          difficulty: codingProblem.difficulty || "Medium",
          functionSignature: codingProblem.functionSignature,
          constraints: codingProblem.constraints || [],
          examples: codingProblem.examples || [],
          hints: codingProblem.hints || [],
          starterCode: codingProblem.starterCode || "",
          testCases: codingProblem.testCases || [],
          expectedAnswer: "",
          gradingMode: autoGradePrefs.coding ? "auto_grade" : "manual_grade", // FIXED: Use auto-grade pref
        };
      } else {
        // Fallback: Generate structured problem from simple question text
        const codingProblem = await generateCodingQuestion(
          typeof question_text === "string" ? question_text : JSON.stringify(question_text),
          effectiveContext,
          course_context,
        );
        formattedQuestion = {
          title: codingProblem.title || question_text,
          question: codingProblem.problemStatement || codingProblem.question,
          type: "coding",
          language: codingProblem.language || "python",
          difficulty: codingProblem.difficulty || "Medium",
          functionSignature: codingProblem.functionSignature,
          constraints: codingProblem.constraints || [],
          examples: codingProblem.examples || [],
          hints: codingProblem.hints || [],
          starterCode: codingProblem.starterCode || "",
          testCases: codingProblem.testCases || [],
          expectedAnswer: "",
          gradingMode: autoGradePrefs.coding ? "auto_grade" : "manual_grade", // FIXED: Use auto-grade pref
        };
      }
    } else if (finalType === "multiple_choice") {
      // Priority: 1) Answer key MCQ, 2) Pre-generated options from preview, 3) Generate with AI
      if (answerKeyMcq) {
        console.log("📚 Using verified answer key MCQ");
        formattedQuestion = {
          question: answerKeyMcq.question,
          type: "multiple_choice",
          options: answerKeyMcq.options,
          correctAnswer: answerKeyMcq.correctAnswer,
          explanation: answerKeyMcq.explanation,
          source: "answer_key",
          answerKeyProblemId: answerKeyMcq.problemId,
          answerKeyMcqId: answerKeyMcq.mcqId,
        };
      } else if (options && Array.isArray(options) && options.length === 4 && correct_answer) {
        // Use pre-generated options from preview dialog (allows instructor editing)
        console.log("📝 Using pre-generated MCQ options from preview dialog");
        // Normalize options to have letter prefixes so student UI grades correctly
        const MCQ_LETTERS = ["A", "B", "C", "D"];
        const normalizedOptions = options.map((opt: string, i: number) => {
          const trimmed = opt.trim();
          // Already has a letter prefix like "A. text" or "A) text"
          if (/^[A-D][\).\-\s]/i.test(trimmed)) return trimmed;
          return `${MCQ_LETTERS[i]}. ${trimmed}`;
        });
        formattedQuestion = {
          question: question_text,
          type: "multiple_choice",
          options: normalizedOptions,
          correctAnswer: correct_answer,
          explanation: explanation || "",
          source: "preview_edited",
          gradingMode: autoGradePrefs.mcq ? "auto_grade" : "manual_grade",
        };
      } else {
        // Fallback: generate with AI
        console.log("🤖 Generating MCQ options with AI");
        const mcq = await generateMCQ(question_text, effectiveContext, course_context);
        formattedQuestion = {
          question: mcq.question,
          type: "multiple_choice",
          options: mcq.options,
          correctAnswer: mcq.correctAnswer,
          explanation: mcq.explanation,
          gradingMode: autoGradePrefs.mcq ? "auto_grade" : "manual_grade", // FIXED: Add gradingMode
        };
      }
    } else if (finalType === "poll") {
      // Poll format - collect responses without grading
      if (options && Array.isArray(options) && options.length >= 2) {
        const MCQ_LETTERS = ["A", "B", "C", "D"];
        const normalizedOptions = options.map((opt: string, i: number) => {
          const trimmed = opt.trim();
          if (/^[A-D][\).\-\s]/i.test(trimmed)) return trimmed;
          return `${MCQ_LETTERS[i]}. ${trimmed}`;
        });
        formattedQuestion = {
          question: question_text,
          type: "poll",
          options: normalizedOptions,
          gradingMode: "ungraded",
        };
      } else {
        // Generate poll options with AI
        const mcq = await generateMCQ(question_text, effectiveContext, course_context);
        formattedQuestion = {
          question: mcq.question,
          type: "poll",
          options: mcq.options,
          gradingMode: "ungraded",
        };
      }
    } else {
      // Short answer format - use AI grading if auto-grade enabled AND expected answer available
      formattedQuestion = {
        question: question_text,
        type: "short_answer",
        expectedAnswer: expected_answer || "",
        gradingMode: autoGradePrefs.short_answer && expected_answer ? "auto_grade" : "manual_grade",
      };
    }

    // Performance logging: Formatting complete
    const formatEndTime = Date.now();
    console.log(`⏱️ Question formatted in ${formatEndTime - formatStartTime}ms`);

    // Start timing for total processing
    const startTime = Date.now();

    // Check if instructor has an active live session
    const { data: liveSession } = await supabase
      .from("live_sessions")
      .select("id, session_code")
      .eq("instructor_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // If live session active, send to live_questions for anonymous participants
    // Then ALSO fall through to send to student_assignments for registered students (dual delivery)
    let liveQuestionNumber: number | null = null;
    let liveParticipantCount = 0;
    if (liveSession) {
      console.log(`🔴 LIVE SESSION DETECTED: ${liveSession.session_code} - Using dual delivery mode`);

      // Get question number for this session
      const { count: questionCount } = await supabase
        .from("live_questions")
        .select("*", { count: "exact", head: true })
        .eq("session_id", liveSession.id);

      liveQuestionNumber = (questionCount || 0) + 1;

      // Insert into live_questions for anonymous participants
      const { error: liveInsertError } = await supabase.from("live_questions").insert({
        session_id: liveSession.id,
        instructor_id: user.id,
        question_content: formattedQuestion,
        question_number: liveQuestionNumber,
      });

      if (liveInsertError) {
        console.error("❌ Failed to insert live question:", liveInsertError);
      }

      // Get participant count for logging
      const { count: participantCount } = await supabase
        .from("live_participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", liveSession.id);

      liveParticipantCount = participantCount || 0;
      console.log(`✅ Live question sent to ${liveParticipantCount} anonymous participants`);
      // Fall through to also send to student_assignments below
    }

    // No live session - use traditional student_assignments (authenticated users)
    console.log("📚 Standard mode - sending via student_assignments");

    // Fetch students linked to this instructor, including legacy students for backward compatibility
    let studentLinks: { student_id: string }[] = [];
    
    if (course_id) {
      // Query 1: Students explicitly enrolled in this course
      const { data: courseStudents, error: courseError } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id)
        .eq("course_id", course_id);
      
      // Query 2: Legacy students with no course_id (joined via instructor code)
      const { data: legacyStudents, error: legacyError } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id)
        .is("course_id", null);
      
      if (courseError || legacyError) {
        throw new Error(`Failed to fetch students: ${(courseError || legacyError)?.message}`);
      }
      
      // Combine and deduplicate
      const allStudents = [...(courseStudents || []), ...(legacyStudents || [])];
      const uniqueIds = [...new Set(allStudents.map(s => s.student_id))];
      studentLinks = uniqueIds.map(id => ({ student_id: id }));
      
      console.log(`📚 Found ${studentLinks.length} students (${courseStudents?.length || 0} course-enrolled, ${legacyStudents?.length || 0} legacy)`);
    } else {
      // No course_id - get all instructor's students
      const { data: allStudents, error: linkError } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id);
      
      if (linkError) {
        throw new Error(`Failed to fetch students: ${linkError.message}`);
      }
      studentLinks = allStudents || [];
      console.log(`📚 No course filter - sending to all ${studentLinks.length} students`);
    }
    
    // Error handling is now done within the conditionals above

    if (!studentLinks || studentLinks.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No students linked to instructor",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("👥 Sending to", studentLinks.length, "students");

    // Optimized batch processing - increased batch size for faster delivery
    const BATCH_SIZE = 25; // Increased from 10 to 25 for Phase 1 optimization
    const studentIds = studentLinks.map((link) => link.student_id);
    const batches: string[][] = [];

    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      batches.push(studentIds.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${batches.length} batches of ${BATCH_SIZE} students each`);

    let successCount = 0;
    let failedStudents: string[] = [];

    // Generate idempotency key to prevent duplicates
    const idempotencyKey = `${user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Performance logging: Start batch processing
    const batchStartTime = Date.now();
    console.log("⏱️ Starting batch distribution to students...");

    // PHASE 2 OPTIMIZATION: Process all batches in parallel for 50+ students
    console.log("⚡ Using parallel batch processing for faster delivery");

    const batchPromises = batches.map(async (batch, batchIndex) => {
      console.log(`📤 Starting batch ${batchIndex + 1}/${batches.length} (${batch.length} students)...`);

      // Determine mode based on question type and instructor preferences
      const assignmentMode = getAssignmentMode(finalType);

      const assignments = batch.map((studentId) => ({
        instructor_id: user.id,
        student_id: studentId,
        org_id: instructorOrgId,
        course_id: course_id,
        assignment_type: "lecture_checkin",
        mode: assignmentMode,
        title: "🎯 Live Lecture Question",
        content: {
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source,
          idempotency_key: idempotencyKey,
          // Include transcript context for voice-sent questions
          source_transcript: source_transcript || null,
        },
        completed: false,
        auto_delete_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }));

      try {
        const { error: insertError } = await supabase.from("student_assignments").insert(assignments);

        if (insertError) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, insertError.message);
          return { success: false, students: batch };
        } else {
          console.log(`✅ Batch ${batchIndex + 1}/${batches.length} sent (${batch.length} students)`);
          return { success: true, students: batch };
        }
      } catch (batchError) {
        console.error(`❌ Batch ${batchIndex + 1} exception:`, batchError);
        return { success: false, students: batch };
      }
    });

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);

    // Aggregate results
    batchResults.forEach((result) => {
      if (result.success) {
        successCount += result.students.length;
      } else {
        failedStudents.push(...result.students);
      }
    });

    // Retry failed students once
    if (failedStudents.length > 0 && failedStudents.length < studentIds.length) {
      console.log(`🔄 Retrying ${failedStudents.length} failed students...`);

      // Calculate mode again for retry assignments
      const retryMode = getAssignmentMode(finalType);

      const retryAssignments = failedStudents.map((studentId) => ({
        instructor_id: user.id,
        student_id: studentId,
        org_id: instructorOrgId,
        course_id: course_id,
        assignment_type: "lecture_checkin",
        mode: retryMode,
        title: "🎯 Live Lecture Question",
        content: {
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source, // 'voice_command', 'auto_interval', or 'manual_button'
          source_transcript: source_transcript || null,
        },
        completed: false,
        auto_delete_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }));

      const { error: retryError } = await supabase.from("student_assignments").insert(retryAssignments);

      if (!retryError) {
        successCount += failedStudents.length;
        failedStudents = [];
        console.log("✅ Retry successful for all failed students");
      } else {
        console.error("❌ Retry failed:", retryError.message);
      }
    }

    const batchEndTime = Date.now();
    const batchTime = batchEndTime - batchStartTime;
    const processingTime = batchEndTime - startTime;

    // Performance logging: Complete breakdown
    console.log(`⏱️ Performance breakdown:
      - Formatting: ${formatEndTime - formatStartTime}ms
      - Batch distribution: ${batchTime}ms
      - Total: ${processingTime}ms
      - Success rate: ${successCount}/${studentIds.length} students (${Math.round((successCount / studentIds.length) * 100)}%)`);

    console.log(`✅ Questions sent: ${successCount}/${studentIds.length} students in ${processingTime}ms`);

    // CRITICAL: Verify delivery across the ENTIRE cohort (not just the first
    // 10). Every row we just inserted carries this idempotency_key, so one query
    // tells us exactly who landed. (Caveat: idempotency_key still lives in the
    // `content` JSON — see BE-AP-5 — so `.contains` is unindexed; acceptable
    // until that key is promoted to its own column.)
    let verified = {
      expected: studentIds.length,
      delivered: successCount,
      missing: [] as string[],
      complete: failedStudents.length === 0,
    };

    // Request-scoped structured logger — correlates the delivery outcome by
    // request_id (BE-AP-13). warn/error lines auto-forward to Sentry.
    const log = createLogger({
      operation: "format-and-send-question",
      instructor_id: user.id,
      session_id: liveSession?.id,
    });

    const { data: deliveredRows, error: deliveryError } = await supabase
      .from("student_assignments")
      .select("student_id")
      .eq("instructor_id", user.id)
      .contains("content", { idempotency_key: idempotencyKey });

    if (deliveryError) {
      log.error("delivery verification query failed", {
        error_category: "db_verification",
        idempotency_key: idempotencyKey,
      });
    } else {
      verified = summarizeDelivery(
        studentIds,
        (deliveredRows ?? []).map((r) => r.student_id),
      );

      if (verified.complete) {
        log.info("delivery verified", {
          idempotency_key: idempotencyKey,
          expected: verified.expected,
          delivered: verified.delivered,
          success: true,
        });
      } else {
        // Single call logs structured JSON AND forwards to Sentry as an error.
        log.error("question delivery partial_failure", {
          error_category: "partial_failure",
          idempotency_key: idempotencyKey,
          expected: verified.expected,
          delivered: verified.delivered,
          missing_count: verified.missing.length,
          missing_sample: verified.missing.slice(0, 20),
          session_code: liveSession?.session_code ?? null,
          success: false,
        });
      }
    }

    // Log to question_send_logs for monitoring — using the VERIFIED counts.
    try {
      // Convert question_text to string for logging if it's an object
      const questionTextForLog =
        typeof question_text === "string"
          ? question_text
          : question_text.question_text || question_text.title || JSON.stringify(question_text).substring(0, 200);

      await supabase.from("question_send_logs").insert({
        instructor_id: user.id,
        question_text: questionTextForLog,
        question_type: finalType,
        source: source,
        success: verified.delivered > 0,
        error_message: verified.complete ? null : `${verified.missing.length} students missing their assignment`,
        error_type: verified.complete ? null : "partial_failure",
        student_count: verified.expected,
        successful_sends: verified.delivered,
        failed_sends: verified.missing.length,
        batch_count: batches.length,
        processing_time_ms: processingTime,
      });
    } catch (logError) {
      console.error("Failed to log question send:", logError);
      // Don't fail the request if logging fails
    }

    // Broadcast notification via Supabase Realtime for instant delivery
    const broadcastChannel = supabase.channel(`instructor-${user.id}-questions`);
    await broadcastChannel.send({
      type: "broadcast",
      event: "new-question",
      payload: {
        instructor_id: user.id,
        question_type: finalType,
        timestamp: new Date().toISOString(),
      },
    });
    await supabase.removeChannel(broadcastChannel);

    const responsePayload: Record<string, any> = {
      success: true,
      sent_to: successCount,
      total_students: studentIds.length,
      failed_count: failedStudents.length,
      question_type: finalType,
      question: formattedQuestion,
      batches_processed: batches.length,
      processing_time_ms: processingTime,
      parallel_batches: true,
    };

    // Include live session info if dual delivery was used
    if (liveSession) {
      responsePayload.liveMode = true;
      responsePayload.sessionCode = liveSession.session_code;
      responsePayload.liveParticipantCount = liveParticipantCount;
      responsePayload.liveQuestionNumber = liveQuestionNumber;
    }

    return new Response(
      JSON.stringify(responsePayload),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in format-and-send-question:", error);

    // User-friendly error messages
    let userMessage = "Unknown error occurred";
    let errorType = "server_error";

    if (error instanceof Error) {
      if (error.message.includes("rate limit")) {
        userMessage = "AI service is busy. Please wait a moment and try again.";
        errorType = "rate_limit";
      } else if (error.message.includes("quota exceeded") || error.message.includes("402")) {
        userMessage = "AI service quota exceeded. Please add credits to your Lovable workspace.";
        errorType = "quota_exceeded";
      } else if (error.message.includes("timed out")) {
        userMessage = "Request timed out. The AI service took too long to respond.";
        errorType = "timeout";
      } else if (error.message.includes("parse") || error.message.includes("JSON")) {
        userMessage = "Failed to process AI response. Please try again.";
        errorType = "parse_error";
      } else {
        userMessage = error.message;
      }
    }

    // Log failure to question_send_logs
    try {
      const supabaseForLogging = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      await supabaseForLogging.from("question_send_logs").insert({
        instructor_id: (error as any).user_id || "unknown",
        question_text: (error as any).question_text || "unknown",
        question_type: "unknown",
        source: "unknown",
        success: false,
        error_message: userMessage,
        error_type: errorType,
        student_count: 0,
        successful_sends: 0,
        failed_sends: 0,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({
        error: userMessage,
        error_type: errorType,
        technical_details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
