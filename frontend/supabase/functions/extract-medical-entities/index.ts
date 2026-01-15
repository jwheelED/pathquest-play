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

    const { lectureVideoId, transcript, medicalSpecialty = 'general' } = await req.json();

    if (!lectureVideoId || !transcript) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId or transcript' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Extracting medical entities for lecture ${lectureVideoId}, specialty: ${medicalSpecialty}`);

    // Build transcript text with timestamps
    const transcriptText = Array.isArray(transcript) 
      ? transcript.map((seg: any) => `[${formatTime(seg.start)} - ${formatTime(seg.end)}] ${seg.text}`).join('\n')
      : transcript;

    const systemPrompt = `You are an expert medical educator and physician analyzing a medical lecture transcript.

Your task is to extract structured medical entities from the lecture content for USMLE-style question generation.

ENTITY TYPES TO EXTRACT:
1. PATHOLOGIES - Diseases, conditions, syndromes
2. TREATMENTS - Drugs, procedures, interventions, surgeries
3. MECHANISMS - Pathophysiology, drug MOA, biochemical pathways
4. FINDINGS - Signs, symptoms, lab values, imaging findings
5. RISK_FACTORS - Demographics, exposures, genetic factors, comorbidities

For each entity, identify:
- Entity name (medical term)
- Entity type
- Description (brief clinical description)
- Approximate start/end timestamps in the lecture
- Related entities (what other concepts it connects to)
- Clinical context (how it's used clinically)

Medical specialty context: ${medicalSpecialty}

RESPONSE FORMAT (JSON):
{
  "entities": [
    {
      "entity_type": "pathology",
      "entity_name": "Pheochromocytoma",
      "description": "Catecholamine-secreting tumor of the adrenal medulla",
      "start_timestamp": 120.0,
      "end_timestamp": 180.0,
      "related_entities": ["hypertension", "catecholamines", "adrenalectomy"],
      "clinical_context": {
        "classic_presentation": "episodic headaches, palpitations, diaphoresis, hypertension",
        "key_labs": "elevated urinary metanephrines, VMA",
        "treatment": "alpha-blockade before surgery, surgical resection",
        "associations": ["MEN 2", "VHL disease", "NF1"],
        "differential": ["essential hypertension", "thyrotoxicosis", "carcinoid"]
      }
    }
  ],
  "high_yield_topics": ["topic1", "topic2"],
  "lecture_summary": "Brief summary of main medical concepts"
}

Rules:
1. Use standard medical terminology
2. Include USMLE-relevant details in clinical context
3. Link related entities for concept mapping
4. Identify high-yield board-relevant topics
5. Be comprehensive but avoid duplicates`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using Pro for better medical reasoning
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract medical entities from this lecture transcript:\n\n${transcriptText}` }
        ],
        max_tokens: 5000,
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
    let extractedData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse medical entity extraction');
    }

    console.log(`Extracted ${extractedData.entities?.length || 0} medical entities`);

    // Store entities in database
    if (extractedData.entities && extractedData.entities.length > 0) {
      const entitiesToInsert = extractedData.entities.map((e: any) => ({
        lecture_video_id: lectureVideoId,
        entity_type: e.entity_type,
        entity_name: e.entity_name,
        description: e.description,
        start_timestamp: e.start_timestamp,
        end_timestamp: e.end_timestamp,
        related_entities: e.related_entities || [],
        clinical_context: e.clinical_context || {}
      }));

      const { error: insertError } = await supabase
        .from('lecture_medical_entities')
        .insert(entitiesToInsert);

      if (insertError) {
        console.error('Failed to insert medical entities:', insertError);
      }
    }

    // Update lecture video with extracted entities summary
    await supabase
      .from('lecture_videos')
      .update({
        domain_type: 'medical',
        extracted_entities: {
          entities: extractedData.entities,
          high_yield_topics: extractedData.high_yield_topics,
          lecture_summary: extractedData.lecture_summary,
          extracted_at: new Date().toISOString()
        }
      })
      .eq('id', lectureVideoId);

    return new Response(JSON.stringify({
      success: true,
      entities: extractedData.entities,
      highYieldTopics: extractedData.high_yield_topics,
      lectureSummary: extractedData.lecture_summary
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in extract-medical-entities:', error);
    return new Response(JSON.stringify({
      error: error?.message || 'Failed to extract medical entities'
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