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
    console.log('LTI OIDC Login initiated');

    // Parse form data or query params (LMS may send as either)
    let params: URLSearchParams;
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        params = new URLSearchParams(await req.text());
      } else {
        const body = await req.json();
        params = new URLSearchParams(body);
      }
    } else {
      params = new URL(req.url).searchParams;
    }

    const iss = params.get('iss');
    const loginHint = params.get('login_hint');
    const targetLinkUri = params.get('target_link_uri');
    const clientId = params.get('client_id');
    const ltiMessageHint = params.get('lti_message_hint');
    const ltiDeploymentId = params.get('lti_deployment_id');

    console.log('OIDC params:', { iss, loginHint, targetLinkUri, clientId });

    if (!iss || !loginHint || !targetLinkUri) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: iss, login_hint, or target_link_uri' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the platform configuration
    let query = supabase
      .from('lti_platforms')
      .select('*')
      .eq('issuer', iss)
      .eq('is_active', true);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data: platform, error: platformError } = await query.single();

    if (platformError || !platform) {
      console.error('Platform not found:', platformError);
      return new Response(
        JSON.stringify({ error: 'LTI platform not registered', issuer: iss }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate state and nonce for OIDC flow
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    // Store state/nonce temporarily (in production, use Redis or similar)
    // For now, we'll encode it in the state parameter
    const stateData = btoa(JSON.stringify({
      state,
      nonce,
      targetLinkUri,
      platformId: platform.id,
      timestamp: Date.now(),
    }));

    // Build the authorization redirect URL
    const authParams = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: platform.client_id,
      redirect_uri: `${supabaseUrl}/functions/v1/lti-launch`,
      login_hint: loginHint,
      state: stateData,
      nonce: nonce,
    });

    if (ltiMessageHint) {
      authParams.set('lti_message_hint', ltiMessageHint);
    }

    const authUrl = `${platform.auth_url}?${authParams.toString()}`;

    console.log('Redirecting to auth URL:', authUrl);

    // Return HTML that redirects to the auth URL
    // (Some LMS require form post, others accept redirect)
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to LMS...</title>
        </head>
        <body>
          <p>Redirecting to your LMS for authentication...</p>
          <script>window.location.href = "${authUrl}";</script>
          <noscript>
            <a href="${authUrl}">Click here to continue</a>
          </noscript>
        </body>
      </html>`,
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error: unknown) {
    console.error('OIDC Login error:', error);
    return new Response(
      JSON.stringify({ error: 'OIDC login failed', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
