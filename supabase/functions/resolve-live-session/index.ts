import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { sessionCode } = await req.json();

    if (!sessionCode) {
      return new Response(
        JSON.stringify({ error: 'sessionCode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: session, error: sessionError } = await adminClient
      .from('live_sessions')
      .select('id, is_active, session_code, title, created_at')
      .eq('session_code', sessionCode)
      .maybeSingle();

    if (sessionError) {
      console.error('Error finding session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to find session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found. Check the code and try again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: questions } = await adminClient
      .from('live_questions')
      .select('id, question_content, sent_at')
      .eq('session_id', session.id)
      .order('sent_at', { ascending: false })
      .limit(5);

    return new Response(
      JSON.stringify({ session, questions: questions || [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
