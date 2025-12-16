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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Generating daily remediation for user:', user.id);

    // Step 1: Get concepts due for review (spaced repetition)
    const now = new Date().toISOString();
    const { data: dueForReview, error: reviewError } = await supabase
      .from('student_concept_mastery')
      .select('*')
      .eq('student_id', user.id)
      .or(`next_review_at.is.null,next_review_at.lte.${now}`)
      .order('strength_score', { ascending: true })
      .limit(10);

    if (reviewError) {
      console.error('Error fetching concepts due for review:', reviewError);
    }

    // Step 2: Get unresolved error patterns
    const { data: errorPatterns, error: errorPatternsError } = await supabase
      .from('student_error_patterns')
      .select('*')
      .eq('student_id', user.id)
      .eq('resolved', false)
      .order('occurrence_count', { ascending: false })
      .limit(5);

    if (errorPatternsError) {
      console.error('Error fetching error patterns:', errorPatternsError);
    }

    // Step 3: Get weak concepts (mastery_level = 'weak' or 'shaky')
    const { data: weakConcepts, error: weakError } = await supabase
      .from('student_concept_mastery')
      .select('*')
      .eq('student_id', user.id)
      .in('mastery_level', ['weak', 'shaky'])
      .order('strength_score', { ascending: true })
      .limit(10);

    if (weakError) {
      console.error('Error fetching weak concepts:', weakError);
    }

    // Step 4: Get personalized questions targeting these concepts
    const conceptNames = [
      ...(dueForReview || []).map(c => c.concept_name),
      ...(weakConcepts || []).map(c => c.concept_name)
    ];

    let reviewQuestions: any[] = [];
    
    if (conceptNames.length > 0) {
      // Try to find existing questions that target these concepts
      const { data: existingQuestions, error: questionsError } = await supabase
        .from('personalized_questions')
        .select('*')
        .eq('user_id', user.id)
        .overlaps('topic_tags', conceptNames)
        .limit(10);

      if (questionsError) {
        console.error('Error fetching personalized questions:', questionsError);
      } else {
        reviewQuestions = existingQuestions || [];
      }
    }

    // Step 5: Calculate estimated review time (1 minute per question, 30 seconds per concept review)
    const questionCount = Math.min(reviewQuestions.length || 5, 10);
    const conceptCount = (dueForReview?.length || 0) + (weakConcepts?.length || 0);
    const estimatedMinutes = Math.max(5, Math.ceil(questionCount * 1 + conceptCount * 0.5));

    // Step 6: Build the remediation set
    const remediationSet = {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      estimatedMinutes,
      
      // Concepts that need review
      conceptsToReview: [
        ...(dueForReview || []).map(c => ({
          name: c.concept_name,
          reason: 'spaced_repetition',
          strengthScore: c.strength_score,
          lastPracticedAt: c.last_practiced_at,
          relatedLectures: c.related_lectures || []
        })),
        ...(weakConcepts || [])
          .filter(c => !(dueForReview || []).some(d => d.concept_name === c.concept_name))
          .map(c => ({
            name: c.concept_name,
            reason: 'weak_mastery',
            strengthScore: c.strength_score,
            masteryLevel: c.mastery_level,
            relatedLectures: c.related_lectures || []
          }))
      ].slice(0, 8),

      // Error patterns to address
      errorPatternsToAddress: (errorPatterns || []).map(e => ({
        errorType: e.error_type,
        conceptA: e.concept_a,
        conceptB: e.concept_b,
        occurrenceCount: e.occurrence_count
      })),

      // Questions for practice
      questions: reviewQuestions.slice(0, questionCount).map(q => ({
        id: q.id,
        question: q.question_text,
        type: q.question_type,
        difficulty: q.difficulty,
        topicTags: q.topic_tags,
        options: q.options,
        correctAnswer: q.correct_answer,
        explanation: q.explanation
      })),

      // Statistics
      stats: {
        totalConceptsDue: (dueForReview?.length || 0),
        totalWeakConcepts: (weakConcepts?.length || 0),
        totalUnresolvedErrors: (errorPatterns?.length || 0),
        questionCount
      }
    };

    console.log('Generated remediation set:', {
      conceptsToReview: remediationSet.conceptsToReview.length,
      errors: remediationSet.errorPatternsToAddress.length,
      questions: remediationSet.questions.length,
      estimatedMinutes
    });

    return new Response(JSON.stringify(remediationSet), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating daily remediation:', error);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      // Return empty set on error so UI can handle gracefully
      conceptsToReview: [],
      errorPatternsToAddress: [],
      questions: [],
      stats: { totalConceptsDue: 0, totalWeakConcepts: 0, totalUnresolvedErrors: 0, questionCount: 0 },
      estimatedMinutes: 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: errorMessage === 'Unauthorized' ? 401 : 500
    });
  }
});
