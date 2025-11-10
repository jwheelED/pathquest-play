import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Running auto-release check at:', new Date().toISOString());

    // Call the database function to auto-release expired answers
    const { data, error } = await supabase.rpc('auto_release_expired_answers');

    if (error) {
      console.error('Error auto-releasing answers:', error);
      throw error;
    }

    const releasedCount = data || 0;

    // Enhanced logging: fetch details of what was just released
    if (releasedCount > 0) {
      const { data: releasedAssignments } = await supabase
        .from('student_assignments')
        .select('id, title, instructor_id, student_id')
        .eq('release_method', 'auto')
        .eq('answers_released', true)
        .gte('updated_at', new Date(Date.now() - 120000).toISOString()); // Last 2 minutes

      console.log(`✅ Released ${releasedCount} assignment(s):`, releasedAssignments);
    } else {
      console.log('⏳ No assignments ready for auto-release');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        releasedCount,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-release-answers function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
