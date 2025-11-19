import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'instructor'
    });

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Instructor role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { interval_transcript, interval_minutes, format_preference, force_send } = await req.json();

    // Adjust minimum content requirement based on force_send mode
    const minContentLength = force_send ? 25 : 100;
    
    if (!interval_transcript || interval_transcript.length < minContentLength) {
      console.log(`⚠️ Not enough content: ${interval_transcript?.length || 0}/${minContentLength} chars (force_send: ${force_send})`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Not enough content in interval (need ${minContentLength}+ chars)` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (force_send) {
      console.log('🔥 Force send mode enabled - lowering quality thresholds');
    }

    console.log(`📝 Generating auto-question from ${interval_minutes}-minute interval (${interval_transcript.length} chars)`);
    console.log(`🎯 Format preference: ${format_preference || 'multiple_choice'}`);

    // Different prompts based on format preference
    let prompt: string;
    
    if (format_preference === 'coding') {
      // LeetCode-style coding problem generation
      prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture on programming/computer science.

RECENT LECTURE CONTENT (last ${interval_minutes} minutes):
"${interval_transcript}"

TASK: Generate ONE LeetCode-style coding problem based on the MOST IMPORTANT concept from this lecture segment.

REQUIREMENTS:
1. Create a practical coding challenge that tests the key concept taught
2. Include proper problem structure with constraints and complexity requirements
3. Match the programming language being taught in the lecture
4. Make it solvable based on what was just covered
5. Appropriate difficulty for a lecture check-in (Easy to Medium level)

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
    } else {
      // Original prompt for multiple choice / short answer
      prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture.

RECENT LECTURE CONTENT (last ${interval_minutes} minutes):
"${interval_transcript}"

TASK: Generate ONE high-quality question that:
1. Tests the MOST IMPORTANT concept from this interval
2. Is clearly answerable based on what was just taught
3. Requires students to apply or recall key information
4. Avoids trivial or overly specific details

CRITERIA:
- Focus on main concepts, not minor details
- Question should be fair and clear
- Appropriate difficulty for what was just covered
- Avoid questions about examples unless they're core to understanding
- The question should test comprehension, not just recall

Return JSON:
{
  "question_text": "the question",
  "suggested_type": "multiple_choice" | "short_answer",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}`;
    }

    // Add timeout handling (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: 'You are an educational AI that generates high-quality lecture check-in questions. Return ONLY valid JSON, no markdown formatting. NEVER truncate questions mid-sentence.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000, // Increased from default to ensure complete JSON
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'AI request timed out after 30 seconds' 
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      let errorMessage = 'Failed to generate question from AI';
      if (response.status === 429) {
        errorMessage = 'AI service rate limit exceeded. Please try again in a moment.';
      } else if (response.status === 402) {
        errorMessage = 'AI service quota exceeded. Please add credits to your workspace.';
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        status_code: response.status
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices[0].message.content;
    
    // Enhanced JSON parsing with markdown cleanup
    content = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse failed, content:', content);
      // Fallback: try to extract JSON from text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to parse AI response'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('✅ Auto-question generated:', result.question_text);
    console.log('📊 Confidence:', result.confidence, '| Reasoning:', result.reasoning);

    // Validate question completeness before checking confidence
    if (typeof result.question_text === 'string') {
      const questionLength = result.question_text.trim().length;
      const endsWithQuestionMark = result.question_text.trim().endsWith('?');
      const wordCount = result.question_text.trim().split(/\s+/).length;
      
      console.log('📏 Question stats:', {
        length: questionLength,
        wordCount: wordCount,
        endsWithQuestionMark: endsWithQuestionMark,
        lastWord: result.question_text.split(/\s+/).pop(),
        firstWords: result.question_text.split(/\s+/).slice(0, 5).join(' ')
      });
      
      // Red flags for truncation
      if (questionLength < 10) {
        console.log('⚠️ Question too short (likely truncated)');
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Generated question is too short (possible truncation)',
          question_text: result.question_text
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (wordCount >= 4 && !endsWithQuestionMark && !result.question_text.endsWith('.')) {
        console.log('⚠️ Question missing proper ending (likely truncated)');
        console.log('   Question:', result.question_text);
      }
    }

    // Only return questions with reasonable confidence
    // Lower threshold when force_send is enabled
    const confidenceThreshold = force_send ? 0.1 : 0.3;
    if (result.confidence < confidenceThreshold) {
      console.log(`⚠️ Confidence too low (${result.confidence} < ${confidenceThreshold}), skipping auto-question`);
      console.log('   Question was:', result.question_text);
      console.log('   Reasoning:', result.reasoning);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Generated question did not meet confidence threshold',
        confidence: result.confidence,
        question_text: result.question_text,
        reasoning: result.reasoning
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (force_send && result.confidence < 0.3) {
      console.log(`🔥 Force send: Accepting low confidence question (${result.confidence})`);
    }

    // Return appropriate structure based on format
    if (format_preference === 'coding') {
      // Return full structured coding problem
      return new Response(JSON.stringify({ 
        success: true,
        question_text: result, // Pass entire structured object
        suggested_type: 'coding',
        confidence: result.confidence,
        reasoning: result.reasoning
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Return simple question for MCQ/short answer
      return new Response(JSON.stringify({ 
        success: true,
        question_text: result.question_text,
        suggested_type: result.suggested_type,
        confidence: result.confidence,
        reasoning: result.reasoning
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in generate-interval-question:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
