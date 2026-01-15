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
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { lectureId, responses, pausePoints } = await req.json();

    // Get lecture details with concept map
    const { data: lecture } = await supabase
      .from('lecture_videos')
      .select('title, transcript, cognitive_analysis')
      .eq('id', lectureId)
      .single();

    // Get concept map for this lecture
    const { data: conceptMap } = await supabase
      .from('lecture_concept_map')
      .select('*')
      .eq('lecture_video_id', lectureId);

    // Analyze responses to determine mastery
    const incorrectQuestionIds = pausePoints
      .filter((p: any) => responses[p.id] && !responses[p.id].correct)
      .map((p: any) => p.id);

    const correctQuestionIds = pausePoints
      .filter((p: any) => responses[p.id] && responses[p.id].correct)
      .map((p: any) => p.id);

    // Build mastery data from concept map and responses
    const conceptMastery: Record<string, { correct: number; total: number; timestamps: number[] }> = {};
    
    // Map questions to concepts via timestamps
    pausePoints.forEach((point: any) => {
      const relatedConcepts = (conceptMap || []).filter((c: any) => 
        point.timestamp >= c.start_timestamp && point.timestamp <= c.end_timestamp
      );

      relatedConcepts.forEach((concept: any) => {
        if (!conceptMastery[concept.concept_name]) {
          conceptMastery[concept.concept_name] = { correct: 0, total: 0, timestamps: [] };
        }
        conceptMastery[concept.concept_name].total++;
        conceptMastery[concept.concept_name].timestamps.push(concept.start_timestamp);
        
        if (responses[point.id]?.correct) {
          conceptMastery[concept.concept_name].correct++;
        }
      });
    });

    // Classify concepts as mastered, shaky, or weak
    const masteredConcepts: { name: string; strengthScore: number }[] = [];
    const weakConcepts: { name: string; strengthScore: number; errorPatterns: string[] }[] = [];
    const recommendedRewatches: { timestamp: number; endTimestamp: number; concept: string; reason: string }[] = [];

    Object.entries(conceptMastery).forEach(([name, data]) => {
      const strengthScore = data.total > 0 ? data.correct / data.total : 0;
      
      if (strengthScore >= 0.8) {
        masteredConcepts.push({ name, strengthScore });
      } else {
        weakConcepts.push({ 
          name, 
          strengthScore,
          errorPatterns: strengthScore < 0.5 ? ['needs_review'] : ['needs_practice']
        });
        
        // Add rewatch recommendation for weak concepts
        const conceptInfo = conceptMap?.find((c: any) => c.concept_name === name);
        if (conceptInfo) {
          recommendedRewatches.push({
            timestamp: conceptInfo.start_timestamp,
            endTimestamp: conceptInfo.end_timestamp,
            concept: name,
            reason: strengthScore < 0.5 
              ? 'You struggled with this concept - rewatch recommended'
              : 'Could use some reinforcement'
          });
        }
      }
    });

    // Update student_concept_mastery table with new data
    for (const [conceptName, data] of Object.entries(conceptMastery)) {
      const strengthScore = data.total > 0 ? data.correct / data.total : 0;
      const masteryLevel = strengthScore >= 0.8 ? 'mastered' 
        : strengthScore >= 0.5 ? 'shaky' 
        : 'weak';

      // Calculate next review date using SM-2 algorithm
      const now = new Date();
      let intervalDays = 1;
      if (masteryLevel === 'mastered') intervalDays = 7;
      else if (masteryLevel === 'shaky') intervalDays = 3;
      
      const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      await supabase
        .from('student_concept_mastery')
        .upsert({
          student_id: user.id,
          concept_name: conceptName,
          mastery_level: masteryLevel,
          strength_score: Math.round(strengthScore * 100) / 100,
          total_attempts: data.total,
          correct_attempts: data.correct,
          last_practiced_at: now.toISOString(),
          next_review_at: nextReviewAt.toISOString(),
          related_lectures: [lectureId]
        }, {
          onConflict: 'student_id,concept_name'
        });
    }

    // Record error patterns for incorrect answers
    for (const questionId of incorrectQuestionIds) {
      const point = pausePoints.find((p: any) => p.id === questionId);
      if (!point) continue;

      // Check if this was a confusion error (if the response matches another concept)
      await supabase
        .from('student_error_patterns')
        .insert({
          student_id: user.id,
          error_type: 'incomplete_understanding',
          concept_a: point.question || 'Unknown concept',
          occurrence_count: 1,
          last_occurred_at: new Date().toISOString()
        });
    }

    return new Response(JSON.stringify({
      masteredConcepts,
      weakConcepts,
      recommendedRewatches: recommendedRewatches.slice(0, 3), // Limit to top 3
      lectureTitle: lecture?.title
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error generating mastery summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      masteredConcepts: [],
      weakConcepts: [],
      recommendedRewatches: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
