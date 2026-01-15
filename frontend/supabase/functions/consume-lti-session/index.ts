import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_token } = await req.json();

    if (!session_token) {
      return new Response(
        JSON.stringify({ error: 'Missing session_token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(session_token)) {
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find and validate the token
    const { data: tokenData, error: tokenError } = await supabase
      .from('lti_session_tokens')
      .select('*')
      .eq('token', session_token)
      .single();

    if (tokenError || !tokenData) {
      console.error('Token not found:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token has expired
    if (new Date(tokenData.expires_at) < new Date()) {
      // Clean up expired token
      await supabase.from('lti_session_tokens').delete().eq('id', tokenData.id);
      
      return new Response(
        JSON.stringify({ error: 'Session token has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token has already been used (single-use pattern)
    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ error: 'Session token has already been used' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark token as used
    await supabase
      .from('lti_session_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Return the launch data
    return new Response(
      JSON.stringify({
        lti_launch: true,
        platform_id: tokenData.platform_id,
        context_id: tokenData.context_id,
        user_id: tokenData.user_id,
        is_instructor: tokenData.is_instructor,
        redirect_path: tokenData.redirect_path,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error consuming LTI session:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to consume session token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
