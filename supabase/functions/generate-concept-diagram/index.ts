import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { concept, questionText, transcriptContext } = await req.json();

    // Check daily limit (1 diagram per day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayDiagrams, error: countError } = await supabase
      .from('diagram_generations')
      .select('id')
      .eq('student_id', user.id)
      .gte('created_at', today.toISOString());

    if (countError) {
      console.error('Error checking daily limit:', countError);
      return new Response(JSON.stringify({ error: 'Failed to check daily limit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (todayDiagrams && todayDiagrams.length >= 1) {
      return new Response(JSON.stringify({ 
        error: 'Daily limit reached',
        limitReached: true,
        message: "You've used your daily diagram. Try again tomorrow!"
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate diagram using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const diagramPrompt = `Create a simple, clean, educational diagram explaining this medical/scientific concept:

Concept: ${concept}
${questionText ? `Related Question: ${questionText}` : ''}
${transcriptContext ? `Context from lecture: ${transcriptContext.substring(0, 500)}` : ''}

Style requirements:
- Simple, clear visual diagram similar to SketchyMicro/SketchyPharm style
- Use minimal colors (2-3 max) for clarity
- Include labeled arrows and annotations
- Focus on visual memory aids and associations
- Make it memorable and easy to understand
- White or light background
- Educational and professional looking`;

    console.log('Generating diagram for concept:', concept);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          { role: 'user', content: diagramPrompt }
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Service unavailable',
          message: 'Diagram generation is temporarily unavailable.'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Failed to generate diagram' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract image from response
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      console.error('No image in AI response:', JSON.stringify(aiData).substring(0, 500));
      return new Response(JSON.stringify({ error: 'No diagram generated' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save to database for tracking
    const { error: insertError } = await supabase
      .from('diagram_generations')
      .insert({
        student_id: user.id,
        concept_context: concept,
        question_text: questionText || null,
        image_data: imageData.substring(0, 100), // Store truncated for tracking, not full base64
      });

    if (insertError) {
      console.error('Error saving diagram record:', insertError);
      // Continue anyway - diagram was generated successfully
    }

    const textResponse = aiData.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ 
      success: true,
      imageUrl: imageData,
      description: textResponse,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-concept-diagram:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
