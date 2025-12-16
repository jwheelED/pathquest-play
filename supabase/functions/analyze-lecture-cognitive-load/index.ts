import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// ============================================
// BLOOM'S TAXONOMY FRAMEWORK
// ============================================
const BLOOMS_TAXONOMY = {
  remember: {
    level: 1,
    name: 'Remember',
    description: 'Retrieve relevant knowledge from long-term memory',
    verbs: ['define', 'list', 'recall', 'identify', 'name', 'recognize', 'state', 'match', 'label'],
    questionStems: [
      'What is the definition of...?',
      'Which of the following correctly identifies...?',
      'What are the key components of...?',
      'List the main characteristics of...'
    ],
    antiPatterns: [
      'Avoid questions that only require memorization of isolated facts',
      'Maximum 15-20% of questions should be at this level'
    ],
    exampleGood: 'Which of the following is the correct definition of mitochondria?',
    exampleBad: 'What is mitochondria?' // Too vague, encourages one-word answers
  },
  understand: {
    level: 2,
    name: 'Understand',
    description: 'Construct meaning from instructional messages, including oral, written, and graphic communication',
    verbs: ['explain', 'describe', 'summarize', 'paraphrase', 'classify', 'interpret', 'compare', 'exemplify', 'infer'],
    questionStems: [
      'Explain why...',
      'What is the main idea of...?',
      'How would you summarize...?',
      'In your own words, describe...',
      'What is the relationship between X and Y?'
    ],
    antiPatterns: [
      'Dont accept simple definitions as "understanding"',
      'Must require explanation or interpretation, not just recall'
    ],
    exampleGood: 'Explain why the mitochondria is called the "powerhouse of the cell"',
    exampleBad: 'What does powerhouse mean?' // Tests vocabulary, not understanding
  },
  apply: {
    level: 3,
    name: 'Apply',
    description: 'Carry out or use a procedure in a given situation',
    verbs: ['use', 'implement', 'solve', 'demonstrate', 'calculate', 'apply', 'execute', 'construct', 'show'],
    questionStems: [
      'How would you apply X to solve...?',
      'Calculate the result when...',
      'Use this concept to determine...',
      'Given this scenario, what would happen if...?',
      'Demonstrate how to...'
    ],
    antiPatterns: [
      'Must involve a NOVEL situation, not just repetition of an example from the lecture',
      'Should require transferring knowledge to a new context'
    ],
    exampleGood: 'A patient presents with fatigue and muscle weakness. Given that the mitochondria are responsible for ATP production, what cellular process is likely impaired?',
    exampleBad: 'What does the mitochondria produce?' // This is recall, not application
  },
  analyze: {
    level: 4,
    name: 'Analyze',
    description: 'Break material into constituent parts, determine how parts relate to one another and to an overall structure or purpose',
    verbs: ['compare', 'contrast', 'differentiate', 'examine', 'distinguish', 'categorize', 'organize', 'deconstruct', 'attribute'],
    questionStems: [
      'How does X compare to Y?',
      'What evidence supports...?',
      'Distinguish between X and Y',
      'What is the relationship between...?',
      'Analyze why... leads to...',
      'What factors contribute to...?'
    ],
    antiPatterns: [
      'Questions MUST require seeing relationships, patterns, or structures',
      'Simple "what is the difference" questions without requiring reasoning are NOT analysis'
    ],
    exampleGood: 'Compare the energy efficiency of aerobic respiration in mitochondria versus anaerobic glycolysis. What factors make one more advantageous in certain conditions?',
    exampleBad: 'What is the difference between aerobic and anaerobic?' // Too simple, doesnt require deep analysis
  },
  evaluate: {
    level: 5,
    name: 'Evaluate',
    description: 'Make judgments based on criteria and standards',
    verbs: ['judge', 'critique', 'justify', 'assess', 'argue', 'defend', 'prioritize', 'rank', 'recommend'],
    questionStems: [
      'Which approach is better and why?',
      'What are the strengths and weaknesses of...?',
      'Evaluate the effectiveness of...',
      'What criteria would you use to assess...?',
      'Justify your reasoning for...',
      'What is the most important factor in... and why?'
    ],
    antiPatterns: [
      'Must require VALUE JUDGMENT based on criteria, not just description',
      'Should include justification component (and why?)'
    ],
    exampleGood: 'A researcher proposes targeting mitochondria for cancer therapy. Evaluate this approach considering both its potential benefits and risks to healthy cells.',
    exampleBad: 'Is mitochondrial therapy good?' // Too simple, no criteria for judgment
  },
  create: {
    level: 6,
    name: 'Create',
    description: 'Put elements together to form a coherent or functional whole; reorganize elements into a new pattern or structure',
    verbs: ['design', 'construct', 'propose', 'formulate', 'hypothesize', 'invent', 'develop', 'compose', 'plan'],
    questionStems: [
      'Design a solution for...',
      'What would happen if...? Propose a hypothesis.',
      'How could you modify... to achieve...?',
      'Develop a plan to...',
      'What new approach could address...?'
    ],
    antiPatterns: [
      'Requires SYNTHESIS of multiple concepts into something new',
      'Should not have a single correct answer - creativity should be valued'
    ],
    exampleGood: 'Propose a novel therapeutic approach that could enhance mitochondrial function in aging cells. What molecular targets would you focus on and why?',
    exampleBad: 'Make a mitochondria diagram' // This is reproduction, not creation
  }
};

// Map cognitive load score to appropriate Bloom's level
function mapCognitiveLoadToBloomsLevel(cognitiveLoadScore: number, contentComplexity: string): string {
  // High cognitive load sections should get higher-order thinking questions
  if (cognitiveLoadScore >= 9) {
    return Math.random() > 0.3 ? 'evaluate' : 'create';
  }
  if (cognitiveLoadScore >= 7) {
    return Math.random() > 0.4 ? 'analyze' : 'evaluate';
  }
  if (cognitiveLoadScore >= 5) {
    return Math.random() > 0.5 ? 'apply' : 'analyze';
  }
  if (cognitiveLoadScore >= 3) {
    return Math.random() > 0.6 ? 'understand' : 'apply';
  }
  // Low cognitive load - but still limit recall questions
  return Math.random() > 0.7 ? 'understand' : 'remember';
}

// Validate that a question matches its claimed Bloom's level
function validateBloomsLevel(questionText: string, claimedLevel: string): { valid: boolean; suggestedLevel: string; reason: string } {
  const questionLower = questionText.toLowerCase();
  const taxonomy = BLOOMS_TAXONOMY[claimedLevel as keyof typeof BLOOMS_TAXONOMY];
  
  if (!taxonomy) {
    return { valid: false, suggestedLevel: 'understand', reason: 'Unknown level' };
  }
  
  // Check for verb usage
  const hasLevelVerb = taxonomy.verbs.some(verb => questionLower.includes(verb));
  
  // Red flags for misclassification
  const recallIndicators = ['what is', 'define', 'list the', 'name the', 'which of the following is'];
  const hasRecallIndicator = recallIndicators.some(indicator => questionLower.startsWith(indicator));
  
  // If claimed as higher-order but uses recall patterns
  if (claimedLevel !== 'remember' && hasRecallIndicator && !hasLevelVerb) {
    return { 
      valid: false, 
      suggestedLevel: 'remember', 
      reason: 'Question uses recall-level patterns but claimed higher level'
    };
  }
  
  // Check for analysis/evaluation patterns in claimed higher-order questions
  const analysisPatterns = ['compare', 'contrast', 'relationship', 'differ', 'similar', 'factor'];
  const evaluationPatterns = ['better', 'best', 'most important', 'should', 'recommend', 'evaluate', 'justify'];
  const applicationPatterns = ['given', 'scenario', 'would happen', 'calculate', 'determine', 'apply'];
  
  if (claimedLevel === 'analyze' && !analysisPatterns.some(p => questionLower.includes(p))) {
    return { valid: false, suggestedLevel: 'understand', reason: 'Missing analysis patterns' };
  }
  
  if (claimedLevel === 'evaluate' && !evaluationPatterns.some(p => questionLower.includes(p))) {
    return { valid: false, suggestedLevel: 'analyze', reason: 'Missing evaluation patterns' };
  }
  
  if (claimedLevel === 'apply' && !applicationPatterns.some(p => questionLower.includes(p))) {
    // Check if it's actually analysis
    if (analysisPatterns.some(p => questionLower.includes(p))) {
      return { valid: true, suggestedLevel: 'analyze', reason: 'Actually analysis level' };
    }
  }
  
  return { valid: true, suggestedLevel: claimedLevel, reason: 'Matches level' };
}

// Generate distribution ensuring higher-order thinking
function generateBloomsDistribution(questionCount: number, instructorPreferences?: any): Record<string, number> {
  // Default distribution emphasizing higher-order thinking
  // Remember: 10%, Understand: 15%, Apply: 25%, Analyze: 25%, Evaluate: 20%, Create: 5%
  const defaultDist = {
    remember: 0.10,
    understand: 0.15,
    apply: 0.25,
    analyze: 0.25,
    evaluate: 0.20,
    create: 0.05
  };
  
  // Apply instructor preferences if provided (legacy format conversion)
  if (instructorPreferences?.difficulty_mix) {
    const { recall = 20, application = 40, reasoning = 40 } = instructorPreferences.difficulty_mix;
    // Map legacy format to Bloom's
    // recall -> remember + understand
    // application -> apply + analyze  
    // reasoning -> evaluate + create
    const rememberUnderstand = recall / 100;
    const applyAnalyze = application / 100;
    const evaluateCreate = reasoning / 100;
    
    return {
      remember: Math.round(questionCount * (rememberUnderstand * 0.4)),
      understand: Math.round(questionCount * (rememberUnderstand * 0.6)),
      apply: Math.round(questionCount * (applyAnalyze * 0.5)),
      analyze: Math.round(questionCount * (applyAnalyze * 0.5)),
      evaluate: Math.round(questionCount * (evaluateCreate * 0.8)),
      create: Math.max(0, questionCount - Math.round(questionCount * (1 - evaluateCreate * 0.2)))
    };
  }
  
  const distribution: Record<string, number> = {};
  let remaining = questionCount;
  
  // Ensure at least 1 question at each major level (except create for small sets)
  const levels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  
  for (const level of levels) {
    const count = Math.round(questionCount * defaultDist[level as keyof typeof defaultDist]);
    distribution[level] = count;
    remaining -= count;
  }
  
  // Distribute remaining to higher-order levels
  while (remaining > 0) {
    distribution['analyze']++;
    remaining--;
    if (remaining > 0) {
      distribution['apply']++;
      remaining--;
    }
  }
  while (remaining < 0) {
    if (distribution['remember'] > 0) {
      distribution['remember']--;
      remaining++;
    } else if (distribution['understand'] > 0) {
      distribution['understand']--;
      remaining++;
    }
  }
  
  return distribution;
}

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

    const { 
      lectureVideoId, 
      transcript, 
      questionCount = 5, 
      professorType = 'stem', 
      examStyle = 'usmle_step1', 
      medicalSpecialty = 'general' 
    } = await req.json();

    if (!lectureVideoId || !transcript || !Array.isArray(transcript)) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId or transcript array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch instructor's adaptive tutoring settings
    const { data: profile } = await supabase
      .from('profiles')
      .select('difficulty_mix, style_mix, question_preset')
      .eq('id', user.id)
      .single();

    const styleMix = profile?.style_mix || { mcq: 70, short_answer: 30 };
    
    // Generate Bloom's distribution
    const bloomsDistribution = generateBloomsDistribution(questionCount, profile);
    
    console.log(`Analyzing cognitive load for lecture ${lectureVideoId}, ${transcript.length} segments, ${questionCount} questions requested`);
    console.log(`Bloom's Distribution: ${JSON.stringify(bloomsDistribution)}`);

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
          let entityContent = entityResult.choices?.[0]?.message?.content || '';
          
          // Strip markdown code fences
          entityContent = entityContent.replace(/```json\s*/gi, '');
          entityContent = entityContent.replace(/```\s*/g, '');
          entityContent = entityContent.trim();
          
          const entityMatch = entityContent.match(/\{[\s\S]*\}/);
          
          if (entityMatch) {
            let highYieldTopics: any[] = [];
            try {
              const parsed = JSON.parse(entityMatch[0]);
              medicalEntities = parsed.entities || [];
              highYieldTopics = parsed.high_yield_topics || [];
              console.log(`Extracted ${medicalEntities.length} medical entities`);
            } catch (parseErr) {
              console.error('Failed to parse medical entities:', parseErr);
            }
            
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
              extracted_entities: { entities: medicalEntities, high_yield_topics: highYieldTopics }
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
      let conceptContent = conceptResult.choices?.[0]?.message?.content || '';
      
      // Strip markdown code fences
      conceptContent = conceptContent.replace(/```json\s*/gi, '');
      conceptContent = conceptContent.replace(/```\s*/g, '');
      conceptContent = conceptContent.trim();
      
      const conceptMatch = conceptContent.match(/\[[\s\S]*\]/);
      
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

    // Build Bloom's Taxonomy guidance for the AI
    const bloomsGuidance = `
=== BLOOM'S TAXONOMY QUESTION FRAMEWORK ===

You MUST generate questions at specific cognitive levels according to Bloom's Taxonomy.
Each question must clearly match its assigned level through verb usage and question structure.

REQUIRED DISTRIBUTION FOR THIS LECTURE (${questionCount} questions total):
${Object.entries(bloomsDistribution).map(([level, count]) => {
  const tax = BLOOMS_TAXONOMY[level as keyof typeof BLOOMS_TAXONOMY];
  return `- ${tax.name.toUpperCase()} (Level ${tax.level}): ${count} questions
  Description: ${tax.description}
  USE THESE VERBS: ${tax.verbs.join(', ')}
  EXAMPLE STEMS: ${tax.questionStems.slice(0, 2).join(' | ')}
  GOOD EXAMPLE: "${tax.exampleGood}"
  AVOID: ${tax.antiPatterns[0]}`;
}).join('\n\n')}

CRITICAL QUALITY RULES:
1. Questions starting with "What is..." or "Define..." are ONLY acceptable for Remember level
2. Apply level questions MUST present a novel scenario not directly from the lecture
3. Analyze level questions MUST require comparing, contrasting, or examining relationships
4. Evaluate level questions MUST require judgment with justification ("and why?")
5. NEVER generate more than 2 consecutive questions at the same cognitive level
6. At least 40% of questions must be at Apply level (3) or higher

VALIDATION CHECKLIST (apply to each question):
□ Does the question stem use verbs from the correct level?
□ Could a student answer this with pure memorization? (If yes, it's Remember level regardless of what you claim)
□ Does the question require thinking beyond what was directly stated in the lecture?
□ For Apply+: Is there a novel context/scenario the student must transfer knowledge to?
`;

    // Calculate question type distribution based on settings
    const mcqCount = Math.round(questionCount * (styleMix.mcq / 100));
    const shortAnswerCount = questionCount - mcqCount;

    console.log(`Style distribution - MCQ: ${mcqCount}, Short Answer: ${shortAnswerCount}`);
    
    // Build system prompt based on professor type with Bloom's Taxonomy
    let systemPrompt: string;
    
    if (professorType === 'medical') {
      systemPrompt = `You are an expert medical educator analyzing a lecture transcript for cognitive load and USMLE-style question placement.

Your task is to identify ${questionCount} optimal pause points where students should be asked questions.

${bloomsGuidance}

QUESTION STYLE DISTRIBUTION:
- Multiple Choice: ${mcqCount}
- Short Answer: ${shortAnswerCount}

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
    "blooms_level": "analyze",
    "question_style": "multiple_choice",
    "reason": "Complex pathophysiology requires analysis of mechanism relationships",
    "suggested_question_type": "usmle_vignette",
    "question_stem_type": "mechanism",
    "context_summary": "Brief summary of medical content just covered",
    "related_entity": "pheochromocytoma",
    "clinical_focus": "catecholamine excess and hypertension",
    "blooms_verb": "compare"
  }
]

Question stem types for USMLE vignettes:
- "diagnosis" - What is the most likely diagnosis? (Apply level)
- "mechanism" - What is the mechanism of action? (Understand/Analyze level)
- "next_step" - What is the next best step in management? (Apply/Evaluate level)
- "treatment" - What is the most appropriate treatment? (Apply level)
- "finding" - Which finding would you expect? (Apply level)
- "avoid" - Which medication should be avoided? (Evaluate level)

Rules:
1. NEVER place a question in the first 60 seconds - instructors typically do introductions/setup
2. Space questions evenly throughout the lecture (minimum 2 minutes apart)
3. Prioritize high cognitive load clinical concepts for higher Bloom's levels
4. Match blooms_level to cognitive complexity (high load = higher Bloom's)
5. You MUST return EXACTLY ${questionCount} pause points - no more, no fewer
6. Include the specified distribution of blooms_level and question_style`;
    } else {
      systemPrompt = `You are an expert educational psychologist analyzing a lecture transcript for cognitive load and optimal question placement.

Your task is to identify ${questionCount} optimal pause points where students should be asked higher-order thinking questions.

${bloomsGuidance}

QUESTION STYLE DISTRIBUTION:
- Multiple Choice: ${mcqCount}
- Short Answer: ${shortAnswerCount}

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
    "blooms_level": "apply",
    "question_style": "multiple_choice",
    "reason": "Complex formula requires application to novel problem",
    "context_summary": "Brief summary of content just covered",
    "question_suggestion": "Given a right triangle with sides 3 and 4, apply the theorem to find the hypotenuse",
    "related_concept": "Pythagorean theorem",
    "blooms_verb": "calculate"
  }
]

Rules:
1. NEVER place a question in the first 60 seconds - instructors typically do introductions/setup
2. Space questions evenly throughout the lecture (minimum 2 minutes apart)
3. MAP cognitive load to Bloom's level: high load (7+) = analyze/evaluate, medium (4-6) = apply/understand
4. Never place questions in the middle of an explanation - find natural breaks
5. You MUST return EXACTLY ${questionCount} pause points - no more, no fewer
6. Include the specified distribution of blooms_level and question_style`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Use Pro for better question quality
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this lecture transcript and identify ${questionCount} optimal pause points with Bloom's Taxonomy levels:\n\n${transcriptText}` }
        ],
        max_tokens: 8000,
        temperature: 0.4,
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

    // Parse the JSON response with robust truncation recovery
    let pausePoints;
    try {
      // Strip markdown code fences if present
      let cleanContent = content;
      cleanContent = cleanContent.replace(/```json\s*/gi, '');
      cleanContent = cleanContent.replace(/```\s*/g, '');
      cleanContent = cleanContent.trim();
      
      // Helper function to repair truncated JSON
      const repairTruncatedJson = (jsonStr: string): string => {
        let repaired = jsonStr;
        
        // Count quotes to check if we're inside an unclosed string
        // Remove escaped quotes for counting
        const unescapedContent = repaired.replace(/\\"/g, '');
        const quoteCount = (unescapedContent.match(/"/g) || []).length;
        
        // If odd number of quotes, we have an unclosed string
        if (quoteCount % 2 !== 0) {
          // Find the last quote and close the string there
          // First, find where the truncation happened (likely end of content)
          // Close the string with a quote
          repaired = repaired.trimEnd();
          // Remove any partial escape sequences at the end
          repaired = repaired.replace(/\\+$/, '');
          // Remove any incomplete escape sequence
          if (repaired.endsWith('\\')) {
            repaired = repaired.slice(0, -1);
          }
          repaired += '"';
          console.log('[JSON Recovery] Closed unclosed string');
        }
        
        // Now handle unclosed braces/brackets
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        
        // Remove trailing comma before we add closing brackets
        repaired = repaired.replace(/,\s*$/, '');
        
        // Close any unclosed structures
        for (let i = 0; i < openBraces - closeBraces; i++) {
          repaired += '}';
        }
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          repaired += ']';
        }
        
        // Clean up any trailing comma before closing brackets
        repaired = repaired.replace(/,\s*([}\]])/g, '$1');
        
        return repaired;
      };
      
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Try to recover from truncated response by finding array start
        const arrayStart = cleanContent.indexOf('[');
        if (arrayStart !== -1) {
          let jsonStr = cleanContent.slice(arrayStart);
          jsonStr = repairTruncatedJson(jsonStr);
          
          console.log('[JSON Recovery] Attempting to parse repaired truncated JSON...');
          pausePoints = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON array found in response');
        }
      } else {
        let jsonStr = jsonMatch[0];
        // Fix common AI formatting issues: timestamps like 6:04 instead of 364
        jsonStr = jsonStr.replace(/"timestamp":\s*(\d+):(\d+)/g, (_match: string, min: string, sec: string) => {
          const seconds = parseInt(min) * 60 + parseInt(sec);
          return `"timestamp": ${seconds}`;
        });
        
        try {
          pausePoints = JSON.parse(jsonStr);
        } catch (innerParseError) {
          // If normal parse fails, try recovery
          console.log('[JSON Recovery] Initial parse failed, attempting repair...');
          jsonStr = repairTruncatedJson(jsonStr);
          pausePoints = JSON.parse(jsonStr);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.slice(0, 500));
      console.error('Parse error:', parseError);
      
      // Last resort: return empty array and let the fallback generation create all questions
      console.log('[JSON Recovery] All parsing failed, using fallback generation for all questions');
      pausePoints = [];
    }

    console.log(`AI returned ${pausePoints.length} pause points, requested ${questionCount}`);

    // Calculate lecture duration from last transcript segment
    const lastSegment = transcript[transcript.length - 1];
    const transcriptDuration = lastSegment?.end || 600;
    
    const { data: lectureVideo } = await supabase
      .from('lecture_videos')
      .select('duration_seconds')
      .eq('id', lectureVideoId)
      .single();
    
    const lectureDuration = lectureVideo?.duration_seconds || transcriptDuration;
    const minStartTime = Math.max(60, lectureDuration * 0.1);
    const maxTimestamp = Math.max(minStartTime + 60, lectureDuration - 30);
    
    console.log(`[Duration Validation] Video: ${lectureDuration}s, valid range: ${minStartTime}s - ${maxTimestamp}s`);

    // Filter out any questions outside valid timestamp range
    pausePoints = pausePoints.filter((p: any) => {
      const valid = p.timestamp >= minStartTime && p.timestamp <= maxTimestamp;
      if (!valid) {
        console.log(`[Filtering] Removed point at ${p.timestamp}s (outside range ${minStartTime}-${maxTimestamp})`);
      }
      return valid;
    });

    // Validate and fix pause point count
    if (pausePoints.length < questionCount) {
      console.log(`Generating ${questionCount - pausePoints.length} additional pause points to meet quota`);
      
      const usedTimestamps = new Set(pausePoints.map((p: any) => Math.floor(p.timestamp / 30)));
      const missingCount = questionCount - pausePoints.length;
      const availableRange = maxTimestamp - minStartTime;
      const interval = availableRange / (missingCount + 1);
      
      // Determine which Bloom's levels are underrepresented
      const currentLevelCounts: Record<string, number> = {};
      for (const p of pausePoints) {
        const level = p.blooms_level || 'apply';
        currentLevelCounts[level] = (currentLevelCounts[level] || 0) + 1;
      }
      
      const neededLevels: string[] = [];
      for (const [level, needed] of Object.entries(bloomsDistribution)) {
        const current = currentLevelCounts[level] || 0;
        for (let i = 0; i < needed - current; i++) {
          neededLevels.push(level);
        }
      }
      
      for (let i = 0; i < missingCount; i++) {
        let targetTime = Math.round(minStartTime + interval * (i + 1));
        targetTime = Math.max(minStartTime, Math.min(maxTimestamp, targetTime));
        
        let bucket = Math.floor(targetTime / 30);
        let attempts = 0;
        while (usedTimestamps.has(bucket) && attempts < 20) {
          bucket++;
          targetTime = bucket * 30;
          attempts++;
        }
        
        if (targetTime > maxTimestamp) {
          bucket = Math.floor(maxTimestamp / 30);
          while (usedTimestamps.has(bucket) && bucket > Math.floor(minStartTime / 30)) {
            bucket--;
          }
          targetTime = Math.max(minStartTime, bucket * 30);
        }
        
        targetTime = Math.max(minStartTime, Math.min(maxTimestamp, targetTime));
        usedTimestamps.add(Math.floor(targetTime / 30));
        
        // Use needed Bloom's level or default to higher-order
        const bloomsLevel = neededLevels[i] || ['apply', 'analyze', 'evaluate'][i % 3];
        const taxonomy = BLOOMS_TAXONOMY[bloomsLevel as keyof typeof BLOOMS_TAXONOMY];
        const styleTypes = ['multiple_choice', 'short_answer'];
        
        const relevantSegments = transcript.filter((seg: any) => 
          seg.start >= (targetTime - 60) && seg.end <= (targetTime + 60)
        );
        const contextText = relevantSegments.map((s: any) => s.text).join(' ').trim();
        const truncatedContext = contextText.slice(0, 500) || 'Lecture content';
        
        pausePoints.push({
          timestamp: Math.round(targetTime),
          cognitive_load_score: 7,
          blooms_level: bloomsLevel,
          question_style: styleTypes[i % 2],
          reason: `${taxonomy.name} level question for comprehensive coverage`,
          context_summary: truncatedContext,
          question_suggestion: truncatedContext.length > 50 
            ? `Focus on the concepts: "${truncatedContext.slice(0, 150)}"`
            : `Key concepts discussed at ${formatTime(targetTime)}`,
          blooms_verb: taxonomy.verbs[0],
          transcript_context: truncatedContext
        });
      }
      
      pausePoints.sort((a: any, b: any) => a.timestamp - b.timestamp);
    } else if (pausePoints.length > questionCount) {
      console.log(`Trimming ${pausePoints.length - questionCount} excess pause points`);
      pausePoints.sort((a: any, b: any) => (b.cognitive_load_score || 0) - (a.cognitive_load_score || 0));
      pausePoints = pausePoints.slice(0, questionCount);
      pausePoints.sort((a: any, b: any) => a.timestamp - b.timestamp);
    }

    // CRITICAL: Final validation
    if (pausePoints.length !== questionCount) {
      console.error(`MISMATCH: Have ${pausePoints.length} pause points but need ${questionCount}. Forcing correction.`);
      
      while (pausePoints.length < questionCount) {
        const usedTimestamps = new Set(pausePoints.map((p: any) => Math.floor(p.timestamp / 30) * 30));
        const interval = (lectureDuration - minStartTime) / (questionCount + 1);
        let targetTime = minStartTime + interval * (pausePoints.length + 1);
        
        let attempts = 0;
        while (usedTimestamps.has(Math.floor(targetTime / 30) * 30) && attempts < 20) {
          targetTime += 30;
          attempts++;
          if (targetTime > maxTimestamp) {
            targetTime = minStartTime + (Math.random() * (maxTimestamp - minStartTime));
          }
        }
        
        targetTime = Math.max(minStartTime, Math.min(maxTimestamp, targetTime));
        
        const bloomsLevels = ['apply', 'analyze', 'evaluate', 'understand'];
        const bloomsLevel = bloomsLevels[pausePoints.length % 4];
        const taxonomy = BLOOMS_TAXONOMY[bloomsLevel as keyof typeof BLOOMS_TAXONOMY];
        const styleTypes = ['multiple_choice', 'short_answer'];
        
        const relevantSegs = transcript.filter((seg: any) => 
          seg.start >= (targetTime - 60) && seg.end <= (targetTime + 60)
        );
        const ctxText = relevantSegs.map((s: any) => s.text).join(' ').trim();
        const truncCtx = ctxText.slice(0, 500) || 'Lecture content';
        
        pausePoints.push({
          timestamp: Math.round(targetTime),
          cognitive_load_score: 6,
          blooms_level: bloomsLevel,
          question_style: styleTypes[pausePoints.length % 2],
          reason: `${taxonomy.name} level comprehension checkpoint`,
          context_summary: truncCtx,
          question_suggestion: truncCtx.length > 50 
            ? `Focus on the concepts: "${truncCtx.slice(0, 150)}"`
            : `Key concepts discussed at ${formatTime(targetTime)}`,
          blooms_verb: taxonomy.verbs[0],
          transcript_context: truncCtx
        });
      }
      
      if (pausePoints.length > questionCount) {
        pausePoints.sort((a: any, b: any) => (b.cognitive_load_score || 0) - (a.cognitive_load_score || 0));
        pausePoints = pausePoints.slice(0, questionCount);
      }
      
      pausePoints.sort((a: any, b: any) => a.timestamp - b.timestamp);
    }

    console.log(`Final pause point count: ${pausePoints.length} (requested: ${questionCount})`);

    // Generate questions with Bloom's Taxonomy enforcement
    const questionsPromises = pausePoints.map(async (point: any, index: number) => {
      const questionStyle = point.question_style || 'multiple_choice';
      const bloomsLevel = point.blooms_level || 'apply';
      const taxonomy = BLOOMS_TAXONOMY[bloomsLevel as keyof typeof BLOOMS_TAXONOMY];
      
      // For USMLE vignettes, generate clinical scenarios
      if (questionStyle === 'usmle_vignette' && professorType === 'medical') {
        const relatedEntity = medicalEntities.find((e: any) => 
          e.entity_name.toLowerCase().includes(point.related_entity?.toLowerCase() || '') ||
          point.context_summary?.toLowerCase().includes(e.entity_name.toLowerCase())
        ) || medicalEntities[index % medicalEntities.length];

        const vignettePrompt = `Create a USMLE-style clinical vignette question at Bloom's Taxonomy ${taxonomy.name} level.

BLOOM'S LEVEL REQUIREMENTS:
- Level: ${taxonomy.name} (${taxonomy.level}/6)
- Description: ${taxonomy.description}
- REQUIRED VERBS: ${taxonomy.verbs.slice(0, 5).join(', ')}
- EXAMPLE QUESTION STRUCTURE: "${taxonomy.exampleGood}"

Medical concept: ${point.related_entity || point.context_summary}
Question type: ${point.question_stem_type || 'diagnosis'}
Clinical focus: ${point.clinical_focus || 'general understanding'}
Entity context: ${JSON.stringify(relatedEntity?.clinical_context || {})}

CRITICAL: The question MUST require ${taxonomy.description.toLowerCase()}. 
It should NOT be answerable through simple recall or memorization.

Return JSON:
{
  "question": "Full clinical vignette that tests ${taxonomy.name} level thinking",
  "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4", "E. Option 5"],
  "correctAnswer": "A",
  "explanation": "Clinical reasoning explanation that demonstrates ${taxonomy.name} level analysis",
  "blooms_level": "${bloomsLevel}",
  "blooms_verb_used": "the specific verb from ${taxonomy.verbs.join(', ')} that this question uses",
  "vignette_type": "${point.question_stem_type || 'diagnosis'}",
  "tested_concept": "${point.related_entity || ''}",
  "why_not_other_choices": {
    "B": "Why option B is incorrect - explain the reasoning flaw",
    "C": "Why option C is incorrect",
    "D": "Why option D is incorrect",
    "E": "Why option E is incorrect"
  },
  "follow_ups": {
    "correct_confident": {
      "question": "A harder ${bloomsLevel === 'analyze' ? 'evaluate' : bloomsLevel === 'evaluate' ? 'create' : 'analyze'} level question",
      "type": "multiple_choice",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    },
    "correct_uncertain": {
      "question": "A reinforcement question at the same ${bloomsLevel} level with different framing",
      "type": "multiple_choice",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    }
  }
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
                { role: 'system', content: `You are an expert USMLE question writer who creates questions at specific Bloom's Taxonomy levels. 
                
CRITICAL REQUIREMENTS:
1. Questions at Apply level must present a NOVEL clinical scenario requiring knowledge transfer
2. Questions at Analyze level must require COMPARING, CONTRASTING, or EXAMINING RELATIONSHIPS
3. Questions at Evaluate level must require JUDGMENT with JUSTIFICATION
4. NEVER create questions that can be answered through simple memorization unless explicitly at Remember level
5. Include "why not other choices" explanations that address common misconceptions

Return only valid JSON.` },
                { role: 'user', content: vignettePrompt }
              ],
              max_tokens: 2500,
              temperature: 0.5,
            }),
          });

          if (qResponse.ok) {
            const qResult = await qResponse.json();
            const qContent = qResult.choices?.[0]?.message?.content;
            const jsonMatch = qContent?.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
              const parsedQuestion = JSON.parse(jsonMatch[0]);
              
              // Validate Bloom's level
              const validation = validateBloomsLevel(parsedQuestion.question, bloomsLevel);
              if (!validation.valid) {
                console.log(`[Bloom's Validation] Question ${index} claimed ${bloomsLevel} but appears to be ${validation.suggestedLevel}: ${validation.reason}`);
              }
              
              return {
                ...point,
                order_index: index,
                blooms_level: validation.valid ? bloomsLevel : validation.suggestedLevel,
                question_content: {
                  question: parsedQuestion.question,
                  options: parsedQuestion.options,
                  correctAnswer: parsedQuestion.correctAnswer,
                  explanation: parsedQuestion.explanation,
                  vignette_type: parsedQuestion.vignette_type,
                  tested_concept: parsedQuestion.tested_concept,
                  blooms_level: bloomsLevel,
                  blooms_verb_used: parsedQuestion.blooms_verb_used
                },
                question_type: 'usmle_vignette',
                difficulty_type: bloomsLevel, // Use Bloom's level as difficulty indicator
                why_not_other_choices: parsedQuestion.why_not_other_choices || null,
                follow_up_questions: parsedQuestion.follow_ups || null
              };
            }
          }
        } catch (e) {
          console.error(`Failed to generate USMLE vignette for point ${index}:`, e);
        }
      }
      
      // Standard question generation with Bloom's Taxonomy enforcement
      const transcriptContext = point.transcript_context || point.context_summary || '';
      
      const questionPrompt = `Generate a ${questionStyle} question at Bloom's Taxonomy ${taxonomy.name} level.

=== BLOOM'S TAXONOMY REQUIREMENTS ===
Level: ${taxonomy.name} (${taxonomy.level}/6)
Description: ${taxonomy.description}
REQUIRED ACTION VERBS (use at least one): ${taxonomy.verbs.join(', ')}
EXAMPLE STEMS TO USE: ${taxonomy.questionStems.join(' | ')}
GOOD EXAMPLE: "${taxonomy.exampleGood}"
ANTI-PATTERN TO AVOID: "${taxonomy.exampleBad}"

=== LECTURE CONTENT (BASE YOUR QUESTION ON THIS) ===
${transcriptContext || point.context_summary || 'General lecture concepts'}

IMPORTANT: Generate a question ONLY about the lecture content above. Do not use placeholder variables like X or Y.

=== CRITICAL INSTRUCTIONS ===
1. Your question MUST require students to ${taxonomy.description.toLowerCase()}
2. Use one of these verbs in your question: ${taxonomy.verbs.slice(0, 5).join(', ')}
3. The question should NOT be answerable through simple recall unless this is explicitly Remember level
4. For Apply+ levels: Present a NOVEL scenario not directly from the lecture
5. For Analyze level: REQUIRE comparing, contrasting, or examining relationships
6. For Evaluate level: REQUIRE judgment with justification ("and why?")

${questionStyle === 'multiple_choice' ? `Return JSON:
{
  "question": "Question text that clearly tests ${taxonomy.name} level thinking using verbs like: ${taxonomy.verbs.slice(0, 3).join(', ')}",
  "options": ["A. Plausible option", "B. Plausible option", "C. Plausible option", "D. Plausible option"],
  "correctAnswer": "A",
  "explanation": "Detailed explanation of the reasoning process required",
  "blooms_level": "${bloomsLevel}",
  "blooms_verb_used": "the specific action verb from the list that this question uses",
  "why_not_other_choices": {
    "B": "Why B is wrong - address the specific misconception",
    "C": "Why C is wrong",
    "D": "Why D is wrong"
  },
  "follow_ups": {
    "correct_confident": {
      "question": "A harder question at the next Bloom's level up",
      "type": "multiple_choice",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    },
    "correct_uncertain": {
      "question": "A reinforcement question with simpler framing at same level",
      "type": "multiple_choice",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    }
  }
}` : `Return JSON:
{
  "question": "Question text that clearly tests ${taxonomy.name} level thinking",
  "expectedAnswer": "Expected answer demonstrating ${taxonomy.name} level understanding",
  "explanation": "Explanation of why this answer demonstrates the required cognitive level",
  "blooms_level": "${bloomsLevel}",
  "blooms_verb_used": "the specific action verb used",
  "follow_ups": {
    "correct_confident": {
      "question": "A harder transfer question",
      "type": "short_answer",
      "expectedAnswer": "expected answer",
      "explanation": "Explanation"
    },
    "correct_uncertain": {
      "question": "A reinforcement question",
      "type": "short_answer",
      "expectedAnswer": "expected answer",
      "explanation": "Explanation"
    }
  }
}`}`;

      try {
        const qResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-pro', // Use Pro for better question quality
            messages: [
              { role: 'system', content: `You are an expert educator who creates questions at specific Bloom's Taxonomy cognitive levels.

YOUR CRITICAL MISSION: Create questions that genuinely test higher-order thinking, not just recall.

VALIDATION RULES YOU MUST FOLLOW:
1. If the question can be answered by reciting a definition → It's Remember level, regardless of how you phrase it
2. If the question asks "What is X?" → It's Remember level
3. Apply level MUST present a new scenario the student hasn't seen
4. Analyze level MUST require breaking down information and seeing relationships
5. Evaluate level MUST require making a judgment with criteria

QUALITY CHECK: Before returning, verify your question matches the claimed level by checking:
- Does it use the specified action verbs?
- Could a student answer it with pure memorization? (If yes, it's Remember level)
- Does it require the cognitive process described for this level?

Return only valid JSON.` },
              { role: 'user', content: questionPrompt }
            ],
            max_tokens: 1500,
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
          const parsedQuestion = JSON.parse(jsonMatch[0]);
          
          // Validate Bloom's level
          const validation = validateBloomsLevel(parsedQuestion.question, bloomsLevel);
          if (!validation.valid) {
            console.log(`[Bloom's Validation] Question ${index} claimed ${bloomsLevel} but appears to be ${validation.suggestedLevel}: ${validation.reason}`);
          }
          
          return {
            ...point,
            order_index: index,
            blooms_level: validation.valid ? bloomsLevel : validation.suggestedLevel,
            question_content: {
              question: parsedQuestion.question,
              options: parsedQuestion.options,
              correctAnswer: parsedQuestion.correctAnswer,
              expectedAnswer: parsedQuestion.expectedAnswer,
              explanation: parsedQuestion.explanation,
              blooms_level: bloomsLevel,
              blooms_verb_used: parsedQuestion.blooms_verb_used
            },
            question_type: questionStyle,
            difficulty_type: bloomsLevel,
            why_not_other_choices: parsedQuestion.why_not_other_choices || null,
            follow_up_questions: parsedQuestion.follow_ups || null
          };
        }
      } catch (e) {
        console.error(`Failed to generate question for point ${index}:`, e);
      }

      // Fallback: Generate a simple but coherent question from transcript context
      const contextText = transcriptContext || point.context_summary || '';
      const cleanContext = contextText.replace(/[^\w\s.,]/g, ' ').trim();
      
      // Extract key terms from the context for better question generation
      const words = cleanContext.split(/\s+/).filter((w: string) => w.length > 4);
      const keyTerms = words.slice(0, 5).join(', ');
      
      // Create a sensible fallback question based on the content
      const fallbackQuestion = questionStyle === 'multiple_choice'
        ? `Based on the lecture content about ${keyTerms || 'this topic'}, which statement best describes the main concept discussed?`
        : `Explain the key concept discussed in the lecture regarding ${keyTerms || 'this topic'}.`;
      
      console.log(`[Fallback] Generated fallback question for point ${index} due to AI generation failure`);
      
      return {
        ...point,
        order_index: index,
        blooms_level: bloomsLevel,
        question_content: {
          question: fallbackQuestion,
          options: questionStyle === 'multiple_choice' 
            ? [
                'A. The concept involves a specific process described in the lecture',
                'B. The concept relates to an alternative mechanism discussed',
                'C. The concept contradicts the main theory presented',
                'D. The concept is unrelated to the lecture topic'
              ] 
            : undefined,
          correctAnswer: questionStyle === 'multiple_choice' ? 'A' : undefined,
          expectedAnswer: questionStyle === 'short_answer' ? `Explain the concept of ${keyTerms || 'the topic discussed'}` : undefined,
          explanation: `This question tests understanding of ${keyTerms || 'the lecture content'}. Review the lecture around this timestamp for more details.`,
          blooms_level: bloomsLevel
        },
        question_type: questionStyle,
        difficulty_type: bloomsLevel,
        why_not_other_choices: null,
        follow_up_questions: null
      };
    });

    const questionsWithContent = await Promise.all(questionsPromises);

    // Log Bloom's distribution in generated questions
    const generatedDistribution: Record<string, number> = {};
    for (const q of questionsWithContent) {
      const level = q.blooms_level || 'unknown';
      generatedDistribution[level] = (generatedDistribution[level] || 0) + 1;
    }
    console.log(`Generated Bloom's distribution: ${JSON.stringify(generatedDistribution)}`);

    // Store pause points in database
    const pausePointsToInsert = questionsWithContent.map((point: any) => ({
      lecture_video_id: lectureVideoId,
      pause_timestamp: point.timestamp,
      cognitive_load_score: point.cognitive_load_score,
      reason: point.reason,
      question_content: point.question_content,
      question_type: point.question_type,
      order_index: point.order_index,
      difficulty_type: point.blooms_level || point.difficulty_type || 'apply',
      follow_up_questions: point.follow_up_questions,
      why_not_other_choices: point.why_not_other_choices,
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
          blooms_distribution: generatedDistribution,
          average_cognitive_load: pausePointsToInsert.reduce((acc: number, p: any) => 
            acc + (p.cognitive_load_score || 0), 0) / pausePointsToInsert.length
        },
        question_count: pausePointsToInsert.length
      })
      .eq('id', lectureVideoId);

    return new Response(JSON.stringify({
      success: true,
      pausePointCount: pausePointsToInsert.length,
      bloomsDistribution: generatedDistribution,
      requestedDistribution: bloomsDistribution
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-lecture-cognitive-load:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
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
