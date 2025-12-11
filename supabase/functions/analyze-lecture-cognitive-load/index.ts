import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify instructor role
    const { data: hasRole } = await supabase.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'instructor' 
    });
    
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Only instructors can analyze lectures' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lectureVideoId, transcript, questionCount = 5, professorType = 'stem' } = await req.json();

    if (!lectureVideoId || !transcript || !Array.isArray(transcript)) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId or transcript array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing cognitive load for lecture ${lectureVideoId}, ${transcript.length} segments, ${questionCount} questions requested`);

    // Build transcript text with timestamps for analysis
    const transcriptText = transcript.map((seg: any) => 
      `[${formatTime(seg.start)} - ${formatTime(seg.end)}] ${seg.text}`
    ).join('\n');

    const systemPrompt = `You are an expert educational psychologist analyzing a lecture transcript for cognitive load.

Your task is to identify ${questionCount} optimal pause points where students should be asked questions to ensure comprehension before continuing.

COGNITIVE LOAD INDICATORS (score 1-10):
- Introduction of new complex concepts (7-10)
- Mathematical formulas or equations (8-10)
- Multi-step processes or algorithms (7-9)
- Abstract theoretical concepts (6-9)
- Dense technical terminology (6-8)
- Transitions between major topics (5-7)
- Examples after complex explanations (4-6)
- Review or summary sections (3-5)

For ${professorType === 'stem' ? 'STEM/Technical' : 'Humanities/Liberal Arts'} content, focus on:
${professorType === 'stem' 
  ? '- Mathematical derivations and proofs\n- Algorithm explanations\n- Technical process steps\n- Formula introductions\n- Code explanations' 
  : '- Key argument transitions\n- Introduction of new theories\n- Complex philosophical concepts\n- Historical cause-effect chains\n- Literary analysis points'}

RESPONSE FORMAT (JSON array):
[
  {
    "timestamp": 125.5,
    "cognitive_load_score": 8,
    "reason": "Complex formula introduced - Pythagorean theorem derivation",
    "suggested_question_type": "multiple_choice",
    "context_summary": "Brief summary of content just covered",
    "question_suggestion": "What is the relationship between the sides of a right triangle?"
  }
]

Rules:
1. Space questions evenly throughout the lecture (minimum 2 minutes apart)
2. Prioritize points where cognitive load is highest
3. Never place questions in the middle of an explanation - find natural breaks
4. Consider cumulative load - if several complex topics stack, pause earlier
5. Return exactly ${questionCount} pause points`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this lecture transcript and identify ${questionCount} optimal pause points:\n\n${transcriptText}` }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let pausePoints;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }
      pausePoints = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse cognitive load analysis');
    }

    console.log(`Identified ${pausePoints.length} pause points`);

    // Now generate questions for each pause point
    const questionsPromises = pausePoints.map(async (point: any, index: number) => {
      const questionType = point.suggested_question_type || 'multiple_choice';
      
      const questionPrompt = `Generate a ${questionType} question based on this lecture content:

Context: ${point.context_summary}
Suggested question: ${point.question_suggestion}

${questionType === 'multiple_choice' ? `Return JSON:
{
  "question": "question text",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctAnswer": "A",
  "explanation": "Why this is correct"
}` : `Return JSON:
{
  "question": "question text",
  "expectedAnswer": "expected answer",
  "explanation": "Explanation of the answer"
}`}`;

      try {
        const qResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'You are an expert educator creating questions to test student understanding. Return only valid JSON.' },
              { role: 'user', content: questionPrompt }
            ],
            max_tokens: 500,
            temperature: 0.4,
          }),
        });

        if (!qResponse.ok) {
          throw new Error('Question generation failed');
        }

        const qResult = await qResponse.json();
        const qContent = qResult.choices?.[0]?.message?.content;
        const jsonMatch = qContent?.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          return {
            ...point,
            order_index: index,
            question_content: JSON.parse(jsonMatch[0]),
            question_type: questionType
          };
        }
      } catch (e) {
        console.error(`Failed to generate question for point ${index}:`, e);
      }

      // Fallback question if generation fails
      return {
        ...point,
        order_index: index,
        question_content: {
          question: point.question_suggestion || 'What was the main concept discussed?',
          options: questionType === 'multiple_choice' ? ['A. Option 1', 'B. Option 2', 'C. Option 3', 'D. Option 4'] : undefined,
          correctAnswer: questionType === 'multiple_choice' ? 'A' : undefined,
          expectedAnswer: questionType === 'short_answer' ? 'Answer based on lecture content' : undefined,
          explanation: 'Review the lecture content for details.'
        },
        question_type: questionType
      };
    });

    const questionsWithContent = await Promise.all(questionsPromises);

    // Store pause points in database
    const pausePointsToInsert = questionsWithContent.map((point: any) => ({
      lecture_video_id: lectureVideoId,
      pause_timestamp: point.timestamp,
      cognitive_load_score: point.cognitive_load_score,
      reason: point.reason,
      question_content: point.question_content,
      question_type: point.question_type,
      order_index: point.order_index,
      is_active: true
    }));

    const { error: insertError } = await supabase
      .from('lecture_pause_points')
      .insert(pausePointsToInsert);

    if (insertError) {
      console.error('Failed to insert pause points:', insertError);
      throw new Error('Failed to save pause points');
    }

    // Update lecture video status
    await supabase
      .from('lecture_videos')
      .update({ 
        status: 'ready',
        cognitive_analysis: {
          analyzed_at: new Date().toISOString(),
          total_pause_points: pausePointsToInsert.length,
          avg_cognitive_load: pausePointsToInsert.reduce((sum: number, p: any) => sum + p.cognitive_load_score, 0) / pausePointsToInsert.length
        }
      })
      .eq('id', lectureVideoId);

    console.log(`Successfully analyzed lecture ${lectureVideoId} with ${pausePointsToInsert.length} pause points`);

    return new Response(JSON.stringify({ 
      success: true,
      pausePoints: pausePointsToInsert 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in analyze-lecture-cognitive-load:', error);
    return new Response(JSON.stringify({ 
      error: error?.message || 'Failed to analyze lecture'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}