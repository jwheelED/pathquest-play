import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64URL decode helper
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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

// Convert JWK to CryptoKey for verification
async function importJwkKey(jwk: any): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg || 'RS256',
      use: 'sig',
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['verify']
  );
}

// Verify JWT signature against JWKS
async function verifyJwtSignature(token: string, jwksUrl: string, header: any): Promise<boolean> {
  try {
    // Fetch JWKS from platform
    const jwksResponse = await fetch(jwksUrl);
    if (!jwksResponse.ok) {
      console.error('Failed to fetch JWKS:', jwksResponse.status);
      return false;
    }
    
    const jwks = await jwksResponse.json();
    
    // Find the matching key by kid
    const key = jwks.keys?.find((k: any) => k.kid === header.kid);
    if (!key) {
      console.error('No matching key found for kid:', header.kid);
      return false;
    }
    
    // Import the JWK as a CryptoKey
    const cryptoKey = await importJwkKey(key);
    
    // Split token and get signature
    const parts = token.split('.');
    const signedData = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const signatureBytes = base64UrlDecode(parts[2]);
    
    // Verify signature - create new ArrayBuffer copies for compatibility
    const signatureBuffer = new ArrayBuffer(signatureBytes.length);
    new Uint8Array(signatureBuffer).set(signatureBytes);
    
    const signedDataBuffer = new ArrayBuffer(signedData.length);
    new Uint8Array(signedDataBuffer).set(signedData);
    
    const isValid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey,
      signatureBuffer,
      signedDataBuffer
    );
    
    return isValid;
  } catch (error) {
    console.error('JWT verification error:', error);
    return false;
  }
}

// Validate JWT claims
function validateJwtClaims(payload: any, expectedIssuer: string, expectedAudience: string): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);
  
  // Check expiration
  if (payload.exp && payload.exp < now) {
    return { valid: false, error: 'Token has expired' };
  }
  
  // Check not before
  if (payload.nbf && payload.nbf > now) {
    return { valid: false, error: 'Token not yet valid' };
  }
  
  // Check issued at (allow 5 minute clock skew)
  if (payload.iat && payload.iat > now + 300) {
    return { valid: false, error: 'Token issued in the future' };
  }
  
  // Check issuer
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: `Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}` };
  }
  
  // Check audience (can be string or array)
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(expectedAudience)) {
    return { valid: false, error: `Invalid audience: expected ${expectedAudience}` };
  }
  
  return { valid: true };
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

    // Verify JWT signature against platform's JWKS
    console.log('Verifying JWT signature against JWKS:', platform.jwks_url);
    const isSignatureValid = await verifyJwtSignature(idToken, platform.jwks_url, header);
    
    if (!isSignatureValid) {
      console.error('JWT signature verification failed');
      return new Response(
        JSON.stringify({ error: 'Invalid JWT signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('JWT signature verified successfully');

    // Validate JWT claims
    const expectedAudience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const claimsValidation = validateJwtClaims(payload, platform.issuer, expectedAudience);
    
    if (!claimsValidation.valid) {
      console.error('JWT claims validation failed:', claimsValidation.error);
      return new Response(
        JSON.stringify({ error: claimsValidation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('JWT claims validated successfully');

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
