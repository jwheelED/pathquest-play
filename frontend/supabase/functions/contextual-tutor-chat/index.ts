import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      lectureId,
      pausePointId,
      question,
      userAnswer,
      correctAnswer,
      timestampRange,
      transcriptChunk,
      slideText,
      allowGeneralKnowledge,
      userMessage,
      conversationHistory,
    } = await req.json();

    console.log('Contextual tutor chat request:', { 
      lectureId, 
      pausePointId, 
      allowGeneralKnowledge,
      timestampRange,
      hasTranscript: !!transcriptChunk,
      hasSlideText: !!slideText,
    });

    // Build context string
    const contextParts: string[] = [];
    
    contextParts.push(`TIMESTAMP RANGE: ${formatTimestamp(timestampRange.start)} to ${formatTimestamp(timestampRange.end)}`);
    
    if (transcriptChunk) {
      contextParts.push(`LECTURE TRANSCRIPT (from this section):\n"${transcriptChunk}"`);
    }
    
    if (slideText) {
      contextParts.push(`SLIDE CONTENT:\n"${slideText}"`);
    }
    
    contextParts.push(`QUESTION ASKED: ${question}`);
    contextParts.push(`STUDENT'S ANSWER: ${userAnswer}`);
    contextParts.push(`CORRECT ANSWER: ${correctAnswer}`);

    const contextString = contextParts.join('\n\n');

    // Build conversation for AI
    const systemPrompt = allowGeneralKnowledge
      ? `You are a helpful tutor for a student watching an educational lecture video. 
      
You have access to the following context from the lecture:

${contextString}

Your role:
1. Answer the student's questions about this concept
2. When possible, cite specific timestamps from the lecture (e.g., "From ${formatTimestamp(timestampRange.start)}–${formatTimestamp(timestampRange.end)}")
3. Quote relevant parts of the transcript as evidence when helpful
4. You may supplement with general knowledge when the lecture content doesn't fully cover something
5. Keep responses concise but thorough
6. Be encouraging and supportive

When referencing the lecture, always include:
- A timestamp citation in format "From X:XX–Y:YY"
- Direct quotes from the transcript when relevant (mark with quotation marks)

Format your response clearly. If providing a timestamp citation, put it on its own line.`
      : `You are a tutor for a student watching an educational lecture video. You are STRICTLY LIMITED to information from the lecture content provided below.

${contextString}

CRITICAL RULES:
1. ONLY use information from the provided transcript and slide content
2. If the answer isn't in the provided context, say "This isn't covered in this section of the lecture" and suggest what might help
3. ALWAYS cite the timestamp range: "From ${formatTimestamp(timestampRange.start)}–${formatTimestamp(timestampRange.end)}"
4. Quote the transcript directly when explaining concepts (use quotation marks)
5. Do NOT add information beyond what's in the transcript/slides
6. Keep responses concise but helpful
7. Be encouraging and supportive

Format your response clearly:
- Include timestamp citations on their own line
- Use direct quotes from the transcript as evidence`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices[0]?.message?.content || '';

    // Extract timestamp citation if present
    const timestampMatch = content.match(/From (\d+:\d{2})(?:–|-)(\d+:\d{2})/);
    const timestampCitation = timestampMatch ? `From ${timestampMatch[1]}–${timestampMatch[2]}` : null;

    // Extract transcript evidence (quoted text)
    const quoteMatches = content.match(/"([^"]{20,})"/g);
    const transcriptEvidence = quoteMatches ? quoteMatches[0]?.replace(/"/g, '') : null;

    console.log('Contextual tutor response generated successfully');

    return new Response(JSON.stringify({
      response: content,
      timestampCitation,
      transcriptEvidence,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in contextual-tutor-chat:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
