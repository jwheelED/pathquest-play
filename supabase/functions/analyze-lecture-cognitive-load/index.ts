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

    const { lectureVideoId, transcript, questionCount = 5, professorType = 'stem', examStyle = 'usmle_step1', medicalSpecialty = 'general' } = await req.json();

    if (!lectureVideoId || !transcript || !Array.isArray(transcript)) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId or transcript array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing cognitive load for lecture ${lectureVideoId}, ${transcript.length} segments, ${questionCount} questions requested, professorType: ${professorType}`);

    // Build transcript text with timestamps for analysis
    const transcriptText = transcript.map((seg: any) => 
      `[${formatTime(seg.start)} - ${formatTime(seg.end)}] ${seg.text}`
    ).join('\n');

    // For medical lectures, first extract medical entities
    let medicalEntities: any[] = [];
    if (professorType === 'medical') {
      console.log('Medical lecture detected, extracting medical entities first...');
      
      try {
        const entityResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-pro',
            messages: [
              { 
                role: 'system', 
                content: `You are an expert medical educator. Extract medical entities from this transcript for USMLE-style question generation.
                
Return JSON:
{
  "entities": [
    {
      "entity_type": "pathology|treatment|mechanism|finding|risk_factor",
      "entity_name": "Medical term",
      "description": "Brief description",
      "start_timestamp": 60.0,
      "end_timestamp": 120.0,
      "related_entities": ["related term 1", "related term 2"],
      "clinical_context": {
        "classic_presentation": "symptoms",
        "key_labs": "lab findings",
        "treatment": "treatment approach"
      }
    }
  ],
  "high_yield_topics": ["topic1", "topic2"]
}` 
              },
              { role: 'user', content: `Extract medical entities from this lecture:\n\n${transcriptText}` }
            ],
            max_tokens: 4000,
            temperature: 0.3,
          }),
        });

        if (entityResponse.ok) {
          const entityResult = await entityResponse.json();
          const entityContent = entityResult.choices?.[0]?.message?.content;
          const entityMatch = entityContent?.match(/\{[\s\S]*\}/);
          
          if (entityMatch) {
            const parsed = JSON.parse(entityMatch[0]);
            medicalEntities = parsed.entities || [];
            console.log(`Extracted ${medicalEntities.length} medical entities`);
            
            // Store entities in database
            if (medicalEntities.length > 0) {
              const entitiesToInsert = medicalEntities.map((e: any) => ({
                lecture_video_id: lectureVideoId,
                entity_type: e.entity_type,
                entity_name: e.entity_name,
                description: e.description,
                start_timestamp: e.start_timestamp,
                end_timestamp: e.end_timestamp,
                related_entities: e.related_entities || [],
                clinical_context: e.clinical_context || {}
              }));

              await supabase.from('lecture_medical_entities').insert(entitiesToInsert);
            }

            // Update lecture video with entities
            await supabase.from('lecture_videos').update({
              domain_type: 'medical',
              extracted_entities: { entities: medicalEntities, high_yield_topics: parsed.high_yield_topics }
            }).eq('id', lectureVideoId);
          }
        }
      } catch (e) {
        console.error('Failed to extract medical entities:', e);
      }
    }

    // First, generate concept map
    const conceptMapPrompt = `Analyze this lecture transcript and create a concept map.
Identify all distinct concepts taught, their timestamps, prerequisites, and difficulty levels.

Return JSON array:
[
  {
    "concept_name": "Concept Name",
    "start_timestamp": 60.0,
    "end_timestamp": 120.0,
    "prerequisites": ["Previous Concept"],
    "difficulty_level": "intermediate",
    "description": "Brief description of what is covered"
  }
]

Transcript:
${transcriptText}`;

    const conceptMapResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert curriculum designer. Extract concepts from lecture transcripts. Return only valid JSON.' },
          { role: 'user', content: conceptMapPrompt }
        ],
        max_tokens: 3000,
        temperature: 0.3,
      }),
    });

    if (conceptMapResponse.ok) {
      const conceptResult = await conceptMapResponse.json();
      const conceptContent = conceptResult.choices?.[0]?.message?.content;
      const conceptMatch = conceptContent?.match(/\[[\s\S]*\]/);
      
      if (conceptMatch) {
        try {
          const concepts = JSON.parse(conceptMatch[0]);
          console.log(`Generated ${concepts.length} concepts for concept map`);
          
          // Insert concept map
          const conceptsToInsert = concepts.map((c: any) => ({
            lecture_video_id: lectureVideoId,
            concept_name: c.concept_name,
            start_timestamp: c.start_timestamp,
            end_timestamp: c.end_timestamp,
            prerequisites: c.prerequisites || [],
            difficulty_level: c.difficulty_level || 'intermediate',
            description: c.description
          }));

          const { error: conceptError } = await supabase
            .from('lecture_concept_map')
            .insert(conceptsToInsert);

          if (conceptError) {
            console.error('Failed to insert concept map:', conceptError);
          }
        } catch (e) {
          console.error('Failed to parse concept map:', e);
        }
      }
    }

    // Build system prompt based on professor type
    let systemPrompt: string;
    
    if (professorType === 'medical') {
      systemPrompt = `You are an expert medical educator analyzing a lecture transcript for cognitive load and USMLE-style question placement.

Your task is to identify ${questionCount} optimal pause points where students should be asked USMLE-style clinical vignette questions.

COGNITIVE LOAD INDICATORS FOR MEDICAL CONTENT (score 1-10):
- New pathophysiology explanation (8-10)
- Drug mechanism of action (8-10)
- Complex disease processes (7-9)
- Differential diagnosis discussion (7-9)
- Treatment protocols (7-9)
- Clinical presentation patterns (6-8)
- Lab/imaging interpretation (6-8)
- Epidemiology and risk factors (5-7)

EXAM STYLE: ${examStyle === 'usmle_step1' ? 'USMLE Step 1 (focus on mechanisms, pathophysiology)' : 
               examStyle === 'usmle_step2' ? 'USMLE Step 2 CK (focus on diagnosis, management)' :
               'NBME Shelf (clinical reasoning)'}

MEDICAL ENTITIES IDENTIFIED IN LECTURE:
${medicalEntities.map((e: any) => `- ${e.entity_name} (${e.entity_type}): ${e.description || ''}`).join('\n')}

RESPONSE FORMAT (JSON array):
CRITICAL: The "timestamp" field MUST be a NUMBER in seconds (e.g., 125.5, 364, 600.0), NOT a time string like "6:04".
[
  {
    "timestamp": 364,
    "cognitive_load_score": 8,
    "reason": "Complex pathophysiology of pheochromocytoma explained",
    "suggested_question_type": "usmle_vignette",
    "question_stem_type": "diagnosis",
    "context_summary": "Brief summary of medical content just covered",
    "related_entity": "pheochromocytoma",
    "clinical_focus": "catecholamine excess and hypertension"
  }
]

Question stem types for USMLE vignettes:
- "diagnosis" - What is the most likely diagnosis?
- "mechanism" - What is the mechanism of action?
- "next_step" - What is the next best step in management?
- "treatment" - What is the most appropriate treatment?
- "finding" - Which finding would you expect?
- "avoid" - Which medication should be avoided?

Rules:
1. NEVER place a question in the first 60 seconds - instructors typically do introductions/setup
2. Space questions evenly throughout the lecture (minimum 2 minutes apart)
3. Prioritize high cognitive load clinical concepts
4. Vary question stem types for comprehensive testing
5. Focus on high-yield, board-relevant topics
6. You MUST return EXACTLY ${questionCount} pause points - no more, no fewer. This is critical.`;
    } else {
      systemPrompt = `You are an expert educational psychologist analyzing a lecture transcript for cognitive load.

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
CRITICAL: The "timestamp" field MUST be a NUMBER in seconds (e.g., 125.5, 364, 600.0), NOT a time string like "6:04".
[
  {
    "timestamp": 364,
    "cognitive_load_score": 8,
    "reason": "Complex formula introduced - Pythagorean theorem derivation",
    "suggested_question_type": "multiple_choice",
    "context_summary": "Brief summary of content just covered",
    "question_suggestion": "What is the relationship between the sides of a right triangle?",
    "related_concept": "Name of the concept this tests"
  }
]

Rules:
1. NEVER place a question in the first 60 seconds - instructors typically do introductions/setup
2. Space questions evenly throughout the lecture (minimum 2 minutes apart)
3. Prioritize points where cognitive load is highest
4. Never place questions in the middle of an explanation - find natural breaks
5. Consider cumulative load - if several complex topics stack, pause earlier
6. You MUST return EXACTLY ${questionCount} pause points - no more, no fewer. This is critical.`;
    }

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
      
      // Fix common AI formatting issues: timestamps like 6:04 instead of 364
      let jsonStr = jsonMatch[0];
      // Convert MM:SS timestamps to seconds (e.g., "timestamp": 6:04 → "timestamp": 364)
      jsonStr = jsonStr.replace(/"timestamp":\s*(\d+):(\d+)/g, (_match: string, min: string, sec: string) => {
        const seconds = parseInt(min) * 60 + parseInt(sec);
        return `"timestamp": ${seconds}`;
      });
      
      pausePoints = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse cognitive load analysis');
    }

    console.log(`AI returned ${pausePoints.length} pause points, requested ${questionCount}`);

    // Calculate lecture duration from last transcript segment
    const lastSegment = transcript[transcript.length - 1];
    const lectureDuration = lastSegment?.end || 600; // default 10 min
    
    // Minimum start time: 60 seconds or 10% of duration for very short lectures
    const minStartTime = Math.max(60, lectureDuration * 0.1);

    // Filter out any questions in the first 60 seconds (post-processing validation)
    pausePoints = pausePoints.filter((p: any) => p.timestamp >= minStartTime);
    console.log(`After filtering early questions: ${pausePoints.length} pause points remain`);

    // Validate and fix pause point count
    if (pausePoints.length < questionCount) {
      console.log(`Generating ${questionCount - pausePoints.length} additional pause points to meet quota`);
      
      // Find timestamps that are already used
      const usedTimestamps = new Set(pausePoints.map((p: any) => Math.floor(p.timestamp)));
      
      // Generate evenly spaced additional points
      const missingCount = questionCount - pausePoints.length;
      const interval = lectureDuration / (questionCount + 1);
      
      for (let i = 0; i < missingCount; i++) {
        // Find next available timestamp slot - ensure it starts after minStartTime
        let targetTime = Math.max(minStartTime, interval * (pausePoints.length + i + 1));
        
        // Ensure at least 2 minutes apart from existing points
        while (usedTimestamps.has(Math.floor(targetTime)) || 
               pausePoints.some((p: any) => Math.abs(p.timestamp - targetTime) < 120)) {
          targetTime += 30; // Shift by 30 seconds
          if (targetTime >= lectureDuration) {
            targetTime = lectureDuration - 60 - (i * 30); // Work backwards from end
          }
        }
        
        // Create placeholder pause point
        pausePoints.push({
          timestamp: Math.round(targetTime),
          cognitive_load_score: 7,
          reason: "Additional question point for comprehensive coverage",
          suggested_question_type: "multiple_choice",
          context_summary: "Key concept from lecture content",
          question_suggestion: "What is the main takeaway from this section?"
        });
        
        usedTimestamps.add(Math.floor(targetTime));
      }
      
      // Sort by timestamp after adding new points
      pausePoints.sort((a: any, b: any) => a.timestamp - b.timestamp);
    } else if (pausePoints.length > questionCount) {
      // If we have too many, keep the ones with highest cognitive load
      console.log(`Trimming ${pausePoints.length - questionCount} excess pause points`);
      pausePoints.sort((a: any, b: any) => (b.cognitive_load_score || 0) - (a.cognitive_load_score || 0));
      pausePoints = pausePoints.slice(0, questionCount);
      pausePoints.sort((a: any, b: any) => a.timestamp - b.timestamp);
    }

    console.log(`Final pause point count: ${pausePoints.length}`);

    // Now generate questions for each pause point
    const questionsPromises = pausePoints.map(async (point: any, index: number) => {
      const questionType = point.suggested_question_type || 'multiple_choice';
      
      // For USMLE vignettes, generate clinical scenarios
      if (questionType === 'usmle_vignette' && professorType === 'medical') {
        const relatedEntity = medicalEntities.find((e: any) => 
          e.entity_name.toLowerCase().includes(point.related_entity?.toLowerCase() || '') ||
          point.context_summary?.toLowerCase().includes(e.entity_name.toLowerCase())
        ) || medicalEntities[index % medicalEntities.length];

        const vignettePrompt = `Create a USMLE-style clinical vignette question.

Medical concept: ${point.related_entity || point.context_summary}
Question type: ${point.question_stem_type || 'diagnosis'}
Clinical focus: ${point.clinical_focus || 'general understanding'}
Entity context: ${JSON.stringify(relatedEntity?.clinical_context || {})}

Return JSON:
{
  "question": "Full clinical vignette text with patient presentation",
  "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4", "E. Option 5"],
  "correctAnswer": "A",
  "explanation": "Clinical reasoning explanation",
  "vignette_type": "${point.question_stem_type || 'diagnosis'}",
  "tested_concept": "${point.related_entity || ''}"
}`;

        try {
          const qResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-pro',
              messages: [
                { role: 'system', content: 'You are an expert USMLE question writer. Create clinical vignettes with realistic patient scenarios. Return only valid JSON.' },
                { role: 'user', content: vignettePrompt }
              ],
              max_tokens: 1500,
              temperature: 0.5,
            }),
          });

          if (qResponse.ok) {
            const qResult = await qResponse.json();
            const qContent = qResult.choices?.[0]?.message?.content;
            const jsonMatch = qContent?.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
              return {
                ...point,
                order_index: index,
                question_content: JSON.parse(jsonMatch[0]),
                question_type: 'usmle_vignette'
              };
            }
          }
        } catch (e) {
          console.error(`Failed to generate USMLE vignette for point ${index}:`, e);
        }
      }
      
      // Standard question generation for non-medical
      const questionPrompt = `Generate a ${questionType} question based on this lecture content:

Context: ${point.context_summary}
Suggested question: ${point.question_suggestion || point.clinical_focus}

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