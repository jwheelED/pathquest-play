import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { sessionCode, nickname } = await req.json();

    console.log(`join-live-session: Attempting to join with code: ${sessionCode}, nickname: ${nickname}`);

    if (!sessionCode || !nickname) {
      return new Response(
        JSON.stringify({ error: 'Session code and nickname are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session exists and is active
    const { data: session, error: sessionError } = await supabaseClient
      .from('live_sessions')
      .select('id, is_active, ends_at, session_code')
      .eq('session_code', sessionCode)
      .eq('is_active', true)
      .single();

    console.log(`join-live-session: Query result - session:`, session, 'error:', sessionError);

    if (sessionError || !session) {
      console.error(`join-live-session: Session not found or inactive for code: ${sessionCode}`);
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive session code' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if session has expired
    if (new Date(session.ends_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Session has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create participant
    const { data: participant, error: participantError } = await supabaseClient
      .from('live_participants')
      .insert({
        session_id: session.id,
        nickname,
      })
      .select()
      .single();

    if (participantError) {
      console.error('Error creating participant:', participantError);
      return new Response(
        JSON.stringify({ error: 'Failed to join session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Participant ${nickname} joined session ${sessionCode}`);

    return new Response(
      JSON.stringify({ participant, session }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in join-live-session:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});