import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

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

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an educational AI that creates high-quality multiple choice questions.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    }),
  });

  const aiResponse = await response.json();
  return JSON.parse(aiResponse.choices[0].message.content);
};

const generateCodingQuestion = async (questionText: string, context: string) => {
  const prompt = `The professor asked: "${questionText}"

Context from lecture: "${context}"

Create a coding question with:
1. Clear problem statement
2. Function signature/starter code
3. Test cases (input/output examples)
4. Hints if needed

Detect the programming language from context (Python, JavaScript, Java, C++, etc.)

Return JSON:
{
  "question": "problem statement",
  "language": "python" | "javascript" | "java" | etc,
  "starterCode": "function/class template",
  "testCases": [{"input": "...", "expectedOutput": "..."}],
  "hints": ["hint1", "hint2"]
}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an educational AI that creates coding challenges for students.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    }),
  });

  const aiResponse = await response.json();
  return JSON.parse(aiResponse.choices[0].message.content);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // First verify authentication with anon key
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabaseAnon.rpc('has_role', {
      _user_id: user.id,
      _role: 'instructor'
    });

    if (roleError) {
      console.error('Role check failed:', roleError);
      return new Response(JSON.stringify({ 
        error: 'Authorization check failed', 
        details: roleError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Instructor role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // After authentication verified, use service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check when last question was sent (minimum 60 second gap)
    const { data: lastQuestion } = await supabase
      .from('student_assignments')
      .select('created_at')
      .eq('instructor_id', user.id)
      .eq('assignment_type', 'lecture_checkin')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastQuestion) {
      const timeSinceLastQuestion = Date.now() - new Date(lastQuestion.created_at).getTime();
      if (timeSinceLastQuestion < 60000) { // 60 seconds
        const retryAfter = Math.ceil((60000 - timeSinceLastQuestion) / 1000);
        console.log(`⏳ Rate limit: ${retryAfter}s until next question`);
        return new Response(JSON.stringify({ 
          error: 'Please wait 60 seconds between questions',
          error_type: 'cooldown',
          retry_after: retryAfter
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch instructor's custom daily limit
    const { data: instructorProfile } = await supabase
      .from('profiles')
      .select('daily_question_limit')
      .eq('id', user.id)
      .single();
    
    const dailyLimit = instructorProfile?.daily_question_limit || 200;
    console.log(`📊 Daily limit for instructor: ${dailyLimit}`);

    // Check daily limit (custom per instructor)
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('student_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', user.id)
      .eq('assignment_type', 'lecture_checkin')
      .gte('created_at', today);

    if (count && count >= dailyLimit) {
      console.log('🚫 Daily question limit reached');
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const hoursUntilReset = Math.floor((midnight.getTime() - now.getTime()) / (1000 * 60 * 60));
      const minutesUntilReset = Math.floor(((midnight.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));
      
      return new Response(JSON.stringify({ 
        error: 'Daily question limit reached',
        error_type: 'daily_limit',
        current_count: count,
        daily_limit: dailyLimit,
        quota_reset: 'midnight UTC',
        hours_until_reset: hoursUntilReset,
        minutes_until_reset: minutesUntilReset
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { question_text, suggested_type, context, source = 'manual_button' } = await req.json();
    
    // Fetch instructor's question format preference
    const { data: profileData } = await supabase
      .from('profiles')
      .select('question_format_preference')
      .eq('id', user.id)
      .single();
    
    const instructorPreference = profileData?.question_format_preference || 'multiple_choice';
    console.log('📋 Instructor preference:', instructorPreference);
    
    // Use instructor preference instead of AI suggestion
    const finalType = instructorPreference;

    if (!question_text || !suggested_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📝 Formatting question as:', finalType, '-', question_text.substring(0, 50));

    let formattedQuestion: any;

    // Format based on instructor preference
    if (finalType === 'coding') {
      // Use exact transcribed question for coding - always manual grade
      formattedQuestion = {
        question: question_text,
        type: 'coding',
        language: 'python',  // default language
        expectedAnswer: '',
        gradingMode: 'manual_grade'
      };
    } else if (finalType === 'multiple_choice') {
      const mcq = await generateMCQ(question_text, context || '');
      formattedQuestion = {
        question: mcq.question,
        type: 'multiple_choice',
        options: mcq.options,
        correctAnswer: mcq.correctAnswer,
        explanation: mcq.explanation
      };
    } else {
      // Short answer format - always manual grade for lecture check-ins
      formattedQuestion = {
        question: question_text,
        type: 'short_answer',
        expectedAnswer: '',
        gradingMode: 'manual_grade'
      };
    }

    // Fetch students linked to this instructor
    const { data: studentLinks, error: linkError } = await supabase
      .from('instructor_students')
      .select('student_id')
      .eq('instructor_id', user.id);

    if (linkError) {
      throw new Error(`Failed to fetch students: ${linkError.message}`);
    }

    if (!studentLinks || studentLinks.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No students linked to instructor' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('👥 Sending to', studentLinks.length, 'students');

    // Chunked batch processing for better reliability with large classrooms
    const BATCH_SIZE = 15; // Process 15 students at a time
    const studentIds = studentLinks.map(link => link.student_id);
    const batches: string[][] = [];
    
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      batches.push(studentIds.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${batches.length} batches of up to ${BATCH_SIZE} students`);

    let successCount = 0;
    let failedStudents: string[] = [];

    // Process batches sequentially to avoid overwhelming the database
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      const assignments = batch.map(studentId => ({
        instructor_id: user.id,
        student_id: studentId,
        assignment_type: 'lecture_checkin',
        mode: 'manual_grade',
        title: '🎯 Live Lecture Question',
        content: { 
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source // 'voice_command', 'auto_interval', or 'manual_button'
        },
        completed: false,
        auto_delete_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      }));

      try {
        const { error: insertError } = await supabase
          .from('student_assignments')
          .insert(assignments);

        if (insertError) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, insertError.message);
          failedStudents.push(...batch);
        } else {
          successCount += batch.length;
          console.log(`✅ Batch ${batchIndex + 1}/${batches.length} sent (${batch.length} students)`);
        }
      } catch (batchError) {
        console.error(`❌ Batch ${batchIndex + 1} exception:`, batchError);
        failedStudents.push(...batch);
      }
    }

    // Retry failed students once
    if (failedStudents.length > 0 && failedStudents.length < studentIds.length) {
      console.log(`🔄 Retrying ${failedStudents.length} failed students...`);
      
      const retryAssignments = failedStudents.map(studentId => ({
        instructor_id: user.id,
        student_id: studentId,
        assignment_type: 'lecture_checkin',
        mode: 'manual_grade',
        title: '🎯 Live Lecture Question',
        content: { 
          questions: [formattedQuestion],
          isLive: true,
          detectedAutomatically: true,
          source: source // 'voice_command', 'auto_interval', or 'manual_button'
        },
        completed: false,
        auto_delete_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      }));

      const { error: retryError } = await supabase
        .from('student_assignments')
        .insert(retryAssignments);

      if (!retryError) {
        successCount += failedStudents.length;
        failedStudents = [];
        console.log('✅ Retry successful for all failed students');
      } else {
        console.error('❌ Retry failed:', retryError.message);
      }
    }

    console.log(`✅ Questions sent: ${successCount}/${studentIds.length} students`);

    // Broadcast notification via Supabase Realtime for instant delivery
    const broadcastChannel = supabase.channel(`instructor-${user.id}-questions`);
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'new-question',
      payload: {
        instructor_id: user.id,
        question_type: finalType,
        timestamp: new Date().toISOString()
      }
    });
    await supabase.removeChannel(broadcastChannel);

    return new Response(JSON.stringify({ 
      success: true, 
      sent_to: successCount,
      total_students: studentIds.length,
      failed_count: failedStudents.length,
      question_type: finalType,
      question: formattedQuestion,
      batches_processed: batches.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in format-and-send-question:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
