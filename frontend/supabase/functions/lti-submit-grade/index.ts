import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GradeSubmission {
  contextId: string;
  studentId: string;
  assignmentType: 'live_session' | 'assignment' | 'lecture';
  assignmentId: string;
  scoreGiven: number;
  scoreMaximum?: number;
  activityProgress?: 'Initialized' | 'Started' | 'InProgress' | 'Submitted' | 'Completed';
  gradingProgress?: 'NotReady' | 'Pending' | 'PendingManual' | 'Failed' | 'FullyGraded';
  comment?: string;
}

async function getAccessToken(
  supabase: any,
  platform: any
): Promise<string | null> {
  // Check cache first
  const { data: cached } = await supabase
    .from('lti_token_cache')
    .select('access_token, expires_at')
    .eq('platform_id', platform.id)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (cached?.access_token) {
    console.log('Using cached access token');
    return cached.access_token;
  }

  console.log('Fetching new access token from:', platform.token_url);

  // Get our private key for signing
  const { data: keyData } = await supabase
    .from('lti_tool_keys')
    .select('kid, private_key')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!keyData) {
    console.error('No active tool key found');
    return null;
  }

  // Create client assertion JWT
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
    kid: keyData.kid,
  };

  const jwtPayload = {
    iss: platform.client_id,
    sub: platform.client_id,
    aud: platform.token_url,
    iat: now,
    exp: now + 300, // 5 minutes
    jti: crypto.randomUUID(),
  };

  // For demo purposes, we'll use a simpler OAuth2 client credentials flow
  // In production, sign the JWT with the private key
  const tokenParams = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: platform.client_id,
    scope: platform.ags_scopes?.join(' ') || 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  });

  try {
    const tokenResponse = await fetch(platform.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token request failed:', errorText);
      return null;
    }

    const tokenData = await tokenResponse.json();
    
    // Cache the token
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
    await supabase
      .from('lti_token_cache')
      .upsert({
        platform_id: platform.id,
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt.toISOString(),
        scope: tokenData.scope,
      }, {
        onConflict: 'platform_id',
      });

    return tokenData.access_token;
  } catch (error) {
    console.error('Error fetching access token:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('LTI Submit Grade called');

    const submission: GradeSubmission = await req.json();
    const {
      contextId,
      studentId,
      assignmentType,
      assignmentId,
      scoreGiven,
      scoreMaximum = 100,
      activityProgress = 'Completed',
      gradingProgress = 'FullyGraded',
      comment,
    } = submission;

    if (!contextId || !studentId || !assignmentId || scoreGiven === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get context with platform info
    const { data: context, error: contextError } = await supabase
      .from('lti_contexts')
      .select(`
        *,
        platform:lti_platforms(*)
      `)
      .eq('id', contextId)
      .single();

    if (contextError || !context) {
      console.error('Context not found:', contextError);
      return new Response(
        JSON.stringify({ error: 'LTI context not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the LTI user mapping for the student
    const { data: ltiUser } = await supabase
      .from('lti_users')
      .select('lti_user_id')
      .eq('platform_id', context.platform_id)
      .eq('edvana_user_id', studentId)
      .single();

    if (!ltiUser) {
      console.log('Student not linked to LTI, skipping grade sync');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Student not linked to LMS',
          synced: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create initial log entry
    const { data: logEntry, error: logError } = await supabase
      .from('grade_sync_log')
      .insert({
        context_id: contextId,
        student_id: studentId,
        lti_user_id: ltiUser.lti_user_id,
        assignment_type: assignmentType,
        assignment_id: assignmentId,
        score_given: scoreGiven,
        score_maximum: scoreMaximum,
        activity_progress: activityProgress,
        grading_progress: gradingProgress,
        sync_status: 'pending',
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
    }

    // Check if we have a lineitem URL
    if (!context.lineitem_url && !context.lineitems_url) {
      console.log('No AGS endpoints configured, skipping grade sync');
      
      if (logEntry) {
        await supabase
          .from('grade_sync_log')
          .update({
            sync_status: 'failed',
            error_message: 'No AGS endpoints configured',
          })
          .eq('id', logEntry.id);
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'AGS not configured for this context',
          synced: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token
    const accessToken = await getAccessToken(supabase, context.platform);
    
    if (!accessToken) {
      if (logEntry) {
        await supabase
          .from('grade_sync_log')
          .update({
            sync_status: 'failed',
            error_message: 'Failed to obtain access token',
          })
          .eq('id', logEntry.id);
      }

      return new Response(
        JSON.stringify({ error: 'Failed to obtain LMS access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the score payload per LTI AGS spec
    const scorePayload = {
      userId: ltiUser.lti_user_id,
      scoreGiven: scoreGiven,
      scoreMaximum: scoreMaximum,
      activityProgress: activityProgress,
      gradingProgress: gradingProgress,
      timestamp: new Date().toISOString(),
      ...(comment && { comment }),
    };

    console.log('Submitting score:', scorePayload);

    // Determine the scores endpoint
    const scoresUrl = context.lineitem_url 
      ? `${context.lineitem_url}/scores`
      : null;

    if (!scoresUrl) {
      // Would need to create a lineitem first via lineitems_url
      console.log('No lineitem URL, would need to create lineitem first');
      
      if (logEntry) {
        await supabase
          .from('grade_sync_log')
          .update({
            sync_status: 'failed',
            error_message: 'No lineitem URL configured',
          })
          .eq('id', logEntry.id);
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Lineitem not configured',
          synced: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Submit the score to the LMS
    const scoreResponse = await fetch(scoresUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify(scorePayload),
    });

    const responseData = await scoreResponse.text();
    console.log('LMS response:', scoreResponse.status, responseData);

    // Update log entry with result
    if (logEntry) {
      await supabase
        .from('grade_sync_log')
        .update({
          sync_status: scoreResponse.ok ? 'success' : 'failed',
          lms_response: { status: scoreResponse.status, body: responseData },
          error_message: scoreResponse.ok ? null : responseData,
        })
        .eq('id', logEntry.id);
    }

    if (!scoreResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'LMS rejected grade submission',
          lmsStatus: scoreResponse.status,
          lmsResponse: responseData,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: true,
        message: 'Grade submitted to LMS successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('LTI Submit Grade error:', error);
    return new Response(
      JSON.stringify({ error: 'Grade submission failed', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
