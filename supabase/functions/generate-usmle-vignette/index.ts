import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// USMLE question stem templates
const QUESTION_STEMS = {
  diagnosis: [
    "What is the most likely diagnosis?",
    "Which of the following is the most likely diagnosis?",
    "What is the most likely cause of this patient's symptoms?"
  ],
  mechanism: [
    "What is the mechanism of action?",
    "Which of the following best explains the pathophysiology?",
    "What is the underlying mechanism of this condition?"
  ],
  next_step: [
    "What is the next best step in management?",
    "Which of the following is the most appropriate next step?",
    "What should be done next in the management of this patient?"
  ],
  treatment: [
    "What is the most appropriate treatment?",
    "Which medication should be initiated?",
    "What is the definitive treatment for this condition?"
  ],
  finding: [
    "Which finding would you expect on physical examination?",
    "What laboratory abnormality is most likely to be present?",
    "Which of the following imaging findings would you expect?"
  ],
  avoid: [
    "Which medication should be avoided in this patient?",
    "What is contraindicated in this condition?",
    "Which of the following would be harmful in this patient?"
  ]
};

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

    const { 
      lectureVideoId,
      entity,
      contextSummary,
      examStyle = 'usmle_step1',
      difficulty = 'medium',
      questionType = 'diagnosis',
      relatedEntities = []
    } = await req.json();

    if (!lectureVideoId || !entity) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId or entity' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating USMLE vignette for entity: ${entity.entity_name}, type: ${questionType}`);

    // Get question stem templates for this type
    const stems = QUESTION_STEMS[questionType as keyof typeof QUESTION_STEMS] || QUESTION_STEMS.diagnosis;
    const selectedStem = stems[Math.floor(Math.random() * stems.length)];

    const systemPrompt = `You are an expert USMLE question writer creating a clinical vignette.

EXAM STYLE: ${examStyle === 'usmle_step1' ? 'USMLE Step 1 (basic science focus)' : 
              examStyle === 'usmle_step2' ? 'USMLE Step 2 CK (clinical focus)' :
              examStyle === 'comlex' ? 'COMLEX (osteopathic focus)' : 'NBME Shelf Exam'}

DIFFICULTY: ${difficulty}

QUESTION TYPE: ${questionType}

Create a clinical vignette based on the medical concept provided. The vignette should:
1. Present a realistic patient scenario
2. Include relevant demographics, chief complaint, HPI, physical exam, and labs as appropriate
3. Contain specific clinical clues pointing to the correct answer
4. Have plausible distractors that test understanding
5. Include a clear explanation with clinical reasoning

RESPONSE FORMAT (JSON):
{
  "vignette": {
    "patient_demographics": "A 35-year-old male",
    "chief_complaint": "episodic headaches and palpitations",
    "history_present_illness": "3-month history of episodic headaches...",
    "past_medical_history": "No significant past medical history",
    "medications": "None",
    "social_history": "Non-smoker, occasional alcohol",
    "family_history": "Mother with thyroid cancer",
    "physical_exam": "BP 180/100 mmHg, HR 110 bpm, diaphoretic",
    "labs_imaging": "Urinary metanephrines: 1200 μg/24h (normal <350)"
  },
  "question_stem": "${selectedStem}",
  "options": [
    "A. Correct answer",
    "B. Plausible distractor 1",
    "C. Plausible distractor 2", 
    "D. Plausible distractor 3",
    "E. Plausible distractor 4"
  ],
  "correct_answer": "A",
  "explanation": {
    "why_correct": "Detailed explanation of why the correct answer is right",
    "why_others_wrong": {
      "B": "Why B is wrong",
      "C": "Why C is wrong",
      "D": "Why D is wrong",
      "E": "Why E is wrong"
    },
    "high_yield_points": ["Key point 1", "Key point 2"],
    "related_concepts": ["Concept 1", "Concept 2"]
  },
  "difficulty_level": "${difficulty}",
  "tested_concept": "Main concept being tested"
}

Rules:
1. Always include 5 answer choices (A-E)
2. Distractors should be plausible but distinguishable with proper knowledge
3. Include "buzzwords" and classic presentations when appropriate
4. For Step 1, emphasize mechanisms and pathophysiology
5. For Step 2, emphasize clinical management
6. Keep vignette concise but complete (like real USMLE questions)`;

    const userPrompt = `Create a USMLE-style clinical vignette for this medical concept:

MAIN ENTITY:
- Name: ${entity.entity_name}
- Type: ${entity.entity_type}
- Description: ${entity.description || 'N/A'}
- Clinical Context: ${JSON.stringify(entity.clinical_context || {})}

LECTURE CONTEXT: ${contextSummary || 'General medical lecture'}

RELATED CONCEPTS: ${relatedEntities.join(', ') || 'None specified'}

Generate a ${difficulty} difficulty ${questionType} question testing understanding of ${entity.entity_name}.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using Pro for high-quality medical content
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 3000,
        temperature: 0.5,
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
    let vignetteData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      vignetteData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse vignette generation');
    }

    console.log(`Successfully generated USMLE vignette for ${entity.entity_name}`);

    // Format vignette for display
    const formattedVignette = formatVignetteText(vignetteData.vignette);

    return new Response(JSON.stringify({
      success: true,
      question: {
        type: 'usmle_vignette',
        vignette: vignetteData.vignette,
        vignette_text: formattedVignette,
        question_stem: vignetteData.question_stem,
        options: vignetteData.options,
        correctAnswer: vignetteData.correct_answer,
        explanation: vignetteData.explanation,
        difficulty: vignetteData.difficulty_level,
        tested_concept: vignetteData.tested_concept
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in generate-usmle-vignette:', error);
    return new Response(JSON.stringify({
      error: error?.message || 'Failed to generate USMLE vignette'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatVignetteText(vignette: any): string {
  const parts = [];
  
  if (vignette.patient_demographics) {
    parts.push(vignette.patient_demographics);
  }
  if (vignette.chief_complaint) {
    parts.push(`presents with ${vignette.chief_complaint}.`);
  }
  if (vignette.history_present_illness) {
    parts.push(vignette.history_present_illness);
  }
  if (vignette.past_medical_history && vignette.past_medical_history !== 'None') {
    parts.push(`Past medical history is significant for ${vignette.past_medical_history.toLowerCase()}.`);
  }
  if (vignette.medications && vignette.medications !== 'None') {
    parts.push(`Current medications include ${vignette.medications.toLowerCase()}.`);
  }
  if (vignette.family_history && vignette.family_history !== 'None') {
    parts.push(`Family history is notable for ${vignette.family_history.toLowerCase()}.`);
  }
  if (vignette.physical_exam) {
    parts.push(`On physical examination, ${vignette.physical_exam.toLowerCase()}.`);
  }
  if (vignette.labs_imaging) {
    parts.push(`Laboratory studies show: ${vignette.labs_imaging}.`);
  }
  
  return parts.join(' ');
}