import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const generateMCQ = async (questionText: string, context: string) => {
  const prompt = `The professor asked: "${questionText}"

Context from lecture: "${context}"

Generate a multiple choice question with 4 options:
- One correct answer
- Three plausible distractors based on common misconceptions
- IMPORTANT: Randomize which option (A, B, C, or D) is correct - don't always make A correct
- Match the difficulty to what was just taught
- Keep it concise and clear

Return JSON with options formatted as "A. text", "B. text", "C. text", "D. text":
{
  "question": "the question text",
  "options": ["A. first option text", "B. second option text", "C. third option text", "D. fourth option text"],
  "correctAnswer": "A" | "B" | "C" | "D",
  "explanation": "Why this is correct and others are wrong"
}`;

  // Add timeout handling (30 seconds)
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
        model: "google/gemini-3-pro-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an educational AI that creates high-quality multiple choice questions. Return ONLY valid JSON, no markdown formatting.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
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

const generateCodingQuestion = async (questionText: string, context: string) => {
  const prompt = `Based on the lecture content, create a LeetCode-style coding problem.

PROFESSOR'S QUESTION/TOPIC: "${questionText}"

LECTURE CONTEXT:
"${context}"

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
7. Problem should be solvable based on lecture content`;

  // Add timeout handling (30 seconds)
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
          {
            role: "system",
            content:
              "You are an educational AI that creates coding challenges for students. Return ONLY valid JSON, no markdown formatting.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
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
      if (timeSinceLastQuestion < 15000) {
        // 15 seconds (reduced from 60)
        const retryAfter = Math.ceil((15000 - timeSinceLastQuestion) / 1000);
        console.log(`⏳ Rate limit: ${retryAfter}s until next question`);
        return new Response(
          JSON.stringify({
            error: "Please wait 15 seconds between questions",
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

    const { question_text, suggested_type, context, source = "manual_button" } = await req.json();

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
    const getAssignmentMode = (questionType: string): string => {
      if (questionType === "multiple_choice" && autoGradePrefs.mcq) return "auto_grade";
      if (questionType === "short_answer" && autoGradePrefs.short_answer) return "auto_grade";
      if (questionType === "coding" && autoGradePrefs.coding) return "auto_grade";
      return "manual_grade";
    };

    // PHASE 2 OPTIMIZATION: Send plain text first, upgrade to MCQ in background
    // This reduces preprocessing time from ~4s to ~0.5s
    const shouldUpgradeToMCQ = instructorPreference === "multiple_choice";
    const finalType = shouldUpgradeToMCQ ? "short_answer" : instructorPreference;

    if (!question_text || !suggested_type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle logging for both string and object question_text
    const questionPreview =
      typeof question_text === "string"
        ? question_text.substring(0, 50)
        : question_text.question_text || question_text.title || "Structured problem";

    console.log(
      "📝 Formatting question as:",
      finalType,
      shouldUpgradeToMCQ ? "(will upgrade to MCQ in background)" : "",
      "-",
      questionPreview,
    );

    let formattedQuestion: any;

    // Performance logging: Track formatting time
    let formatStartTime = Date.now();
    console.log("⏱️ Starting question formatting...");

    // PHASE 2: For MCQ preference, send as short_answer first, upgrade in background
    if (shouldUpgradeToMCQ) {
      formattedQuestion = {
        question:
          typeof question_text === "string" ? question_text : question_text.question_text || question_text.title,
        type: "short_answer",
        expectedAnswer: "",
        gradingMode: "manual_grade",
        upgrading_to_mcq: true, // Flag for background upgrade
      };
      console.log("⚡ Skipping MCQ generation - will upgrade in background after sending");
    } else if (finalType === "coding") {
      // For coding questions, check if we have structured problem data
      if (
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
          gradingMode: "manual_grade",
        };
      } else {
        // Fallback: Generate structured problem from simple question text
        const codingProblem = await generateCodingQuestion(
          typeof question_text === "string" ? question_text : JSON.stringify(question_text),
          context || "",
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
          gradingMode: "manual_grade",
        };
      }
    } else if (finalType === "multiple_choice") {
      const mcq = await generateMCQ(question_text, context || "");
      formattedQuestion = {
        question: mcq.question,
        type: "multiple_choice",
        options: mcq.options,
        correctAnswer: mcq.correctAnswer,
        explanation: mcq.explanation,
      };
    } else {
      // Short answer format - always manual grade for lecture check-ins
      formattedQuestion = {
        question: question_text,
        type: "short_answer",
        expectedAnswer: "",
        gradingMode: "manual_grade",
      };
    }

    // Performance logging: Formatting complete
    const formatEndTime = Date.now();
    console.log(`⏱️ Question formatted in ${formatEndTime - formatStartTime}ms`);

    // Fetch students linked to this instructor
    const { data: studentLinks, error: linkError } = await supabase
      .from("instructor_students")
      .select("student_id")
      .eq("instructor_id", user.id);

    if (linkError) {
      throw new Error(`Failed to fetch students: ${linkError.message}`);
    }

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

    const startTime = Date.now();

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
        assignment_type: "lecture_checkin",
        mode: assignmentMode,
        title: "🎯 Live Lecture Question",
        content: {
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source,
          idempotency_key: idempotencyKey,
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
        assignment_type: "lecture_checkin",
        mode: retryMode,
        title: "🎯 Live Lecture Question",
        content: {
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source, // 'voice_command', 'auto_interval', or 'manual_button'
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
    const wasSuccessful = successCount > 0;

    // Performance logging: Complete breakdown
    console.log(`⏱️ Performance breakdown:
      - Formatting: ${formatEndTime - formatStartTime}ms
      - Batch distribution: ${batchTime}ms
      - Total: ${processingTime}ms
      - Success rate: ${successCount}/${studentIds.length} students (${Math.round((successCount / studentIds.length) * 100)}%)`);

    console.log(`✅ Questions sent: ${successCount}/${studentIds.length} students in ${processingTime}ms`);

    // Log to question_send_logs for monitoring
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
        success: wasSuccessful,
        error_message: failedStudents.length > 0 ? `${failedStudents.length} students failed` : null,
        error_type: failedStudents.length > 0 ? "partial_failure" : null,
        student_count: studentIds.length,
        successful_sends: successCount,
        failed_sends: failedStudents.length,
        batch_count: batches.length,
        processing_time_ms: processingTime,
      });
    } catch (logError) {
      console.error("Failed to log question send:", logError);
      // Don't fail the request if logging fails
    }

    // CRITICAL: Verify delivery immediately after sending
    console.log("🔍 Verifying delivery for students:", studentIds.slice(0, 3), "...");
    const { data: deliveryCheck, error: deliveryError } = await supabase
      .from("student_assignments")
      .select("id, student_id")
      .eq("instructor_id", user.id)
      .contains("content", { idempotency_key: idempotencyKey })
      .in("student_id", studentIds.slice(0, 10)); // Check first 10 students

    if (deliveryError) {
      console.error("❌ Delivery verification failed:", deliveryError);
    } else {
      console.log("✅ Delivery verified:", {
        expected: Math.min(10, studentIds.length),
        actual: deliveryCheck?.length || 0,
        student_ids: deliveryCheck?.map((d) => d.student_id).slice(0, 5),
      });

      // Log any discrepancies
      if (deliveryCheck && deliveryCheck.length < Math.min(10, studentIds.length)) {
        console.warn("⚠️ Delivery mismatch:", {
          expected_students: studentIds.slice(0, 10),
          delivered_to: deliveryCheck.map((d) => d.student_id),
          missing_count: Math.min(10, studentIds.length) - deliveryCheck.length,
        });
      }
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

    // PHASE 2: Trigger background MCQ upgrade if needed
    if (shouldUpgradeToMCQ && successCount > 0) {
      console.log("🔄 Triggering background MCQ upgrade for assignments");

      // Use background task to upgrade to MCQ without blocking response
      const upgradePromise = (async () => {
        try {
          const mcq = await generateMCQ(
            typeof question_text === "string" ? question_text : question_text.question_text || question_text.title,
            context || "",
          );

          const mcqQuestion = {
            question: mcq.question,
            type: "multiple_choice",
            options: mcq.options,
            correctAnswer: mcq.correctAnswer,
            explanation: mcq.explanation,
          };

          // Update all assignments with MCQ format
          const { error: updateError } = await supabase
            .from("student_assignments")
            .update({
              content: {
                questions: [mcqQuestion],
                isLive: true,
                detectedAutomatically: true,
                source: source,
                idempotency_key: idempotencyKey,
                upgraded_from_short_answer: true,
              },
            })
            .eq("instructor_id", user.id)
            .contains("content", { idempotency_key: idempotencyKey });

          if (updateError) {
            console.error("❌ Failed to upgrade to MCQ:", updateError);
          } else {
            console.log("✅ Successfully upgraded to MCQ in background");
          }
        } catch (error) {
          console.error("❌ Background MCQ upgrade failed:", error);
        }
      })();

      // Execute background upgrade (will continue after response is sent)
      upgradePromise.catch((error) => {
        console.error("❌ Background MCQ upgrade failed:", error);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: successCount,
        total_students: studentIds.length,
        failed_count: failedStudents.length,
        question_type: shouldUpgradeToMCQ ? "multiple_choice" : finalType,
        question: formattedQuestion,
        batches_processed: batches.length,
        processing_time_ms: processingTime,
        parallel_batches: true,
        upgrading_to_mcq: shouldUpgradeToMCQ,
      }),
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
