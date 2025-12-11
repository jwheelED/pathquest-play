import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decode JWT without verification (verification happens after fetching JWKS)
function decodeJwt(token: string): { header: any; payload: any; signature: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  
  return { header, payload, signature: parts[2] };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('LTI Launch received');

    // LTI 1.3 launch comes as form POST
    const formData = await req.formData();
    const idToken = formData.get('id_token') as string;
    const state = formData.get('state') as string;

    if (!idToken) {
      return new Response(
        JSON.stringify({ error: 'Missing id_token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode state to get our stored data
    let stateData: any = {};
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.warn('Could not decode state:', e);
    }

    // Decode the JWT
    const { header, payload } = decodeJwt(idToken);
    console.log('JWT header:', header);
    console.log('JWT payload (truncated):', {
      iss: payload.iss,
      sub: payload.sub,
      aud: payload.aud,
      'https://purl.imsglobal.org/spec/lti/claim/message_type': payload['https://purl.imsglobal.org/spec/lti/claim/message_type'],
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the platform
    const { data: platform, error: platformError } = await supabase
      .from('lti_platforms')
      .select('*')
      .eq('issuer', payload.iss)
      .eq('client_id', Array.isArray(payload.aud) ? payload.aud[0] : payload.aud)
      .eq('is_active', true)
      .single();

    if (platformError || !platform) {
      console.error('Platform not found:', platformError);
      return new Response(
        JSON.stringify({ error: 'Platform not registered' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Verify JWT signature against platform's JWKS
    // For production, fetch JWKS from platform.jwks_url and verify signature

    // Extract LTI claims
    const ltiClaims = {
      messageType: payload['https://purl.imsglobal.org/spec/lti/claim/message_type'],
      version: payload['https://purl.imsglobal.org/spec/lti/claim/version'],
      deploymentId: payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      targetLinkUri: payload['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'],
      resourceLink: payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'],
      context: payload['https://purl.imsglobal.org/spec/lti/claim/context'],
      roles: payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [],
      ags: payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'],
    };

    console.log('LTI claims:', ltiClaims);

    // Determine if user is instructor or student based on roles
    const isInstructor = ltiClaims.roles.some((role: string) =>
      role.includes('Instructor') || role.includes('Administrator') || role.includes('ContentDeveloper')
    );

    // Create or update LTI user
    const { data: ltiUser, error: userError } = await supabase
      .from('lti_users')
      .upsert({
        platform_id: platform.id,
        lti_user_id: payload.sub,
        email: payload.email,
        name: payload.name || payload.given_name,
        roles: ltiClaims.roles,
      }, {
        onConflict: 'platform_id,lti_user_id',
      })
      .select()
      .single();

    if (userError) {
      console.error('Error upserting LTI user:', userError);
    }

    // Create or update LTI context (course mapping)
    if (ltiClaims.context?.id) {
      const contextData: any = {
        platform_id: platform.id,
        context_id: ltiClaims.context.id,
        context_title: ltiClaims.context.title || ltiClaims.context.label,
      };

      if (ltiClaims.resourceLink?.id) {
        contextData.resource_link_id = ltiClaims.resourceLink.id;
      }

      // Store AGS endpoints if available
      if (ltiClaims.ags) {
        contextData.lineitems_url = ltiClaims.ags.lineitems;
        contextData.lineitem_url = ltiClaims.ags.lineitem;
      }

      // For instructors, set them as the context owner
      if (isInstructor && ltiUser?.edvana_user_id) {
        contextData.instructor_id = ltiUser.edvana_user_id;
      }

      const { error: contextError } = await supabase
        .from('lti_contexts')
        .upsert(contextData, {
          onConflict: 'platform_id,context_id',
          ignoreDuplicates: false,
        });

      if (contextError) {
        console.error('Error upserting context:', contextError);
      }
    }

    // Generate a session token or redirect URL
    // In production, create an Edvana session for the user
    const appUrl = Deno.env.get('APP_URL') || 'https://edvana.app';
    
    // Determine redirect based on role
    let redirectPath = '/dashboard';
    if (isInstructor) {
      redirectPath = '/instructor';
    }

    // Add launch data as query params (in production, use secure session)
    const launchParams = new URLSearchParams({
      lti_launch: 'true',
      platform_id: platform.id,
      context_id: ltiClaims.context?.id || '',
      user_id: payload.sub,
      is_instructor: isInstructor.toString(),
    });

    const redirectUrl = `${appUrl}${redirectPath}?${launchParams.toString()}`;

    console.log('Redirecting to:', redirectUrl);

    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Launching Edvana...</title>
        </head>
        <body>
          <p>Launching Edvana...</p>
          <script>window.location.href = "${redirectUrl}";</script>
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
    console.error('LTI Launch error:', error);
    return new Response(
      JSON.stringify({ error: 'LTI launch failed', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
