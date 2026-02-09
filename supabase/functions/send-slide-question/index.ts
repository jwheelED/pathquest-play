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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify instructor role
    const { data: roleData } = await supabaseAnon.rpc("has_role", {
      _user_id: user.id,
      _role: "instructor",
    });

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Instructor role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { questionType, extractedQuestion, slideNumber, isPollMode = false } = await req.json();

    if (!extractedQuestion || !questionType) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📋 Sending slide question (type: ${questionType}, slide: ${slideNumber}, poll: ${isPollMode})`);

    // Get instructor's org_id
    const { data: instructorProfile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    const instructorOrgId = instructorProfile?.org_id || null;

    // Format content based on question type - handle nested structure from dialog
    let formattedQuestion: any;
    
    // The extractedQuestion comes from the dialog which wraps data in mcq/short_answer/coding keys
    const questionData = extractedQuestion.mcq || extractedQuestion.short_answer || extractedQuestion.coding || extractedQuestion;

    if (questionType === "mcq") {
      formattedQuestion = {
        question: questionData.question || '',
        type: "multiple_choice",
        options: questionData.options || [],
        correctAnswer: questionData.correct_answer || questionData.correctAnswer || 'A',
        explanation: questionData.explanation || "",
        isPoll: isPollMode,
      };
    } else if (questionType === "short_answer") {
      formattedQuestion = {
        question: questionData.question || '',
        type: "short_answer",
        expectedAnswer: isPollMode ? '' : (questionData.expected_answer || questionData.expectedAnswer || ""),
        gradingMode: isPollMode ? "poll" : "manual_grade",
        isPoll: isPollMode,
      };
    } else if (questionType === "coding") {
      formattedQuestion = {
        title: questionData.problem || questionData.question || '',
        question: questionData.problem || questionData.question || '',
        type: "coding",
        functionName: questionData.function_name || questionData.functionName || "",
        parameters: questionData.parameters || "",
        returnType: questionData.return_type || questionData.returnType || "",
        examples: questionData.examples || [],
        constraints: questionData.constraints || "",
        starterCode: questionData.starter_code || questionData.starterCode || "",
        gradingMode: "manual_grade",
      };
    }

    const questionContent = {
      type: isPollMode ? "poll" : "quiz",
      questions: [formattedQuestion],
      isPoll: isPollMode,
    };

    // Get connected students
    const { data: students, error: studentsError } = await supabase
      .from("instructor_students")
      .select("student_id")
      .eq("instructor_id", user.id);

    if (studentsError) {
      console.error("Error fetching students:", studentsError);
      return new Response(JSON.stringify({ error: "Failed to fetch students" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const studentIds = students?.map((s) => s.student_id) || [];
    console.log(`👥 Found ${studentIds.length} connected students`);

    // Check for active live session
    const { data: activeSession } = await supabase
      .from("live_sessions")
      .select("id, session_code")
      .eq("instructor_id", user.id)
      .eq("is_active", true)
      .gt("ends_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let liveQuestionId: string | null = null;

    // Insert into live_questions if session is active
    if (activeSession) {
      console.log(`📡 Active live session found: ${activeSession.session_code}`);

      // Get current question count for numbering
      const { count: questionCount } = await supabase
        .from("live_questions")
        .select("id", { count: "exact", head: true })
        .eq("session_id", activeSession.id);

      const { data: liveQuestion, error: liveError } = await supabase
        .from("live_questions")
        .insert({
          session_id: activeSession.id,
          instructor_id: user.id,
          question_number: (questionCount || 0) + 1,
          question_content: questionContent,
        })
        .select("id")
        .single();

      if (liveError) {
        console.error("Error inserting live question:", liveError);
      } else {
        liveQuestionId = liveQuestion?.id;
        console.log(`✅ Live question created: ${liveQuestionId}`);
      }
    }

    // Create assignments for connected students
    let successfulSends = 0;
    let failedSends = 0;

    if (studentIds.length > 0) {
      const assignments = studentIds.map((studentId) => ({
        student_id: studentId,
        instructor_id: user.id,
        title: isPollMode 
          ? `Poll ${slideNumber || ""}`.trim() 
          : `Slide Question ${slideNumber || ""}`.trim(),
        assignment_type: "lecture_checkin" as const,
        content: questionContent,
        mode: isPollMode ? "manual_grade" as const : (questionType === "mcq" ? "auto_grade" as const : "manual_grade" as const),
        org_id: instructorOrgId,
      }));

      const { data: insertedAssignments, error: insertError } = await supabase
        .from("student_assignments")
        .insert(assignments)
        .select("id");

      if (insertError) {
        console.error("Error inserting assignments:", insertError);
        failedSends = studentIds.length;
      } else {
        successfulSends = insertedAssignments?.length || 0;
        failedSends = studentIds.length - successfulSends;
        console.log(`✅ Created ${successfulSends} student assignments`);
      }
    }

    // Log the question send
    await supabase.from("question_send_logs").insert({
      instructor_id: user.id,
      question_text: formattedQuestion.question,
      question_type: questionType,
      source: "slide_ocr",
      student_count: studentIds.length,
      success: failedSends === 0,
      successful_sends: successfulSends,
      failed_sends: failedSends,
    });

    const totalRecipients = (activeSession ? 1 : 0) + successfulSends;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Question sent to ${totalRecipients} recipient(s)`,
        studentCount: successfulSends,
        liveSessionActive: !!activeSession,
        liveQuestionId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-slide-question:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
