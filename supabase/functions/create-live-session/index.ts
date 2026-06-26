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
    // Validate instructor auth via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create a client with the user's JWT to get user identity
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Both `title` and `courseId` are optional. The "Start Live Class" flow
    // supplies both; the auto-created recording session (InstructorDashboard)
    // has no course context and relies on the defaults below. Routing every
    // creation path through this function guarantees a `session_code` (so
    // anonymous students can always join) plus server-side validation.
    const body = await req.json().catch(() => ({}));
    const rawTitle = typeof body?.title === 'string' ? body.title.trim() : '';
    const title = rawTitle || 'Recording session';
    const courseId = body?.courseId ?? null;

    // Use service role client for insert
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique 6-digit numeric session code
    let sessionCode: string;
    let attempts = 0;
    do {
      sessionCode = String(Math.floor(100000 + Math.random() * 900000));
      const { data: existing } = await adminClient
        .from('live_sessions')
        .select('id')
        .eq('session_code', sessionCode)
        .eq('is_active', true)
        .maybeSingle();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique session code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: session, error: insertError } = await adminClient
      .from('live_sessions')
      .insert({
        title,
        session_code: sessionCode,
        instructor_id: user.id,
        course_id: courseId,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating session:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ session }),
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
