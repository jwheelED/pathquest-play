import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushBankQuestionRequest {
  questionId: string;
  courseId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get auth user from request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("❌ No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("❌ Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📚 Push bank question request from instructor: ${user.id}`);

    // Parse request body
    const { questionId, courseId }: PushBankQuestionRequest = await req.json();

    if (!questionId || !courseId) {
      console.error("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "questionId and courseId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📝 Question ID: ${questionId}, Course ID: ${courseId}`);

    // 1. Fetch the question from the bank
    const { data: question, error: questionError } = await supabase
      .from("instructor_question_bank")
      .select("*")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      console.error("❌ Question not found:", questionError);
      return new Response(
        JSON.stringify({ error: "Question not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify instructor owns the question
    if (question.instructor_id !== user.id) {
      console.error("❌ Instructor does not own this question");
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Question verified: "${question.title}" (${question.question_type})`);

    // 3. Get all students in the course (including legacy students with null course_id for backward compatibility)
    // Query 1: Students explicitly enrolled in this course
    const { data: courseStudents, error: courseStudentsError } = await supabase
      .from("instructor_students")
      .select("student_id")
      .eq("instructor_id", user.id)
      .eq("course_id", courseId);

    // Query 2: Legacy students with no course_id (joined via instructor code)
    const { data: legacyStudents, error: legacyStudentsError } = await supabase
      .from("instructor_students")
      .select("student_id")
      .eq("instructor_id", user.id)
      .is("course_id", null);

    if (courseStudentsError || legacyStudentsError) {
      console.error("❌ Error fetching students:", courseStudentsError || legacyStudentsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch students" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Combine and deduplicate student IDs
    const allStudentLinks = [...(courseStudents || []), ...(legacyStudents || [])];
    const uniqueStudentIds = [...new Set(allStudentLinks.map((link) => link.student_id))];
    
    console.log(`👥 Found ${uniqueStudentIds.length} students (${courseStudents?.length || 0} course-enrolled, ${legacyStudents?.length || 0} legacy)`);

    if (uniqueStudentIds.length === 0) {
      console.log("⚠️ No students enrolled in this course");
      return new Response(
        JSON.stringify({ success: true, studentCount: 0, message: "No students enrolled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const studentIds = uniqueStudentIds;

    // 4. Determine assignment mode based on question type
    // All question types from Question Bank should be auto-graded
    const getAssignmentMode = (questionType: string): string => {
      if (questionType === "multiple_choice") return "auto_grade";
      if (questionType === "coding_simple" || questionType === "coding") return "auto_grade";
      if (questionType === "short_answer") return "auto_grade";
      return "manual_grade";
    };

    // 5. Format the question content for student_assignments
    const questionContent = question.question_content as Record<string, any>;
    const formattedQuestion = {
      ...questionContent,
      title: question.title,
      difficulty: question.difficulty,
    };

    const assignmentContent = {
      questions: [formattedQuestion],
      source: "question_bank",
      questionBankId: question.id,
    };

    // 6. Create student_assignments in batches
    const BATCH_SIZE = 25;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batch = studentIds.slice(i, i + BATCH_SIZE);
      
      const assignments = batch.map((studentId) => ({
        student_id: studentId,
        instructor_id: user.id,
        course_id: courseId,
        assignment_type: "lecture_checkin",
        title: question.title,
        content: assignmentContent,
        mode: getAssignmentMode(question.question_type),
      }));

      const { error: insertError } = await supabase
        .from("student_assignments")
        .insert(assignments);

      if (insertError) {
        console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed:`, insertError);
        
        // Retry once
        console.log("🔄 Retrying batch...");
        const { error: retryError } = await supabase
          .from("student_assignments")
          .insert(assignments);

        if (retryError) {
          console.error("❌ Retry also failed:", retryError);
          failedCount += batch.length;
        } else {
          successCount += batch.length;
        }
      } else {
        successCount += batch.length;
      }
    }

    console.log(`✅ Successfully delivered to ${successCount} students, failed: ${failedCount}`);

    // 7. Update question usage stats
    const { error: updateError } = await supabase
      .from("instructor_question_bank")
      .update({
        times_used: (question.times_used || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", questionId);

    if (updateError) {
      console.warn("⚠️ Failed to update usage stats:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        studentCount: successCount,
        failedCount,
        questionTitle: question.title,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("❌ Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
