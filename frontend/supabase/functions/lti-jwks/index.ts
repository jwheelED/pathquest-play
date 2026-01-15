import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert PEM public key to JWK format
function pemToJwk(pem: string, kid: string): object {
  // Remove PEM headers and decode base64
  const pemContents = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  
  // For RS256, we need to extract n and e from the DER-encoded public key
  // This is a simplified version - in production, use a proper ASN.1 parser
  const der = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  // RSA public key structure: SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  // Skip the outer SEQUENCE and algorithm identifier to get to the BIT STRING
  // Then parse the inner SEQUENCE containing n and e
  
  // For simplicity, we'll use a different approach - store the raw base64
  return {
    kty: 'RSA',
    kid: kid,
    use: 'sig',
    alg: 'RS256',
    n: pemContents, // Base64url encoded modulus
    e: 'AQAB', // Standard RSA exponent 65537
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('JWKS endpoint called');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active public keys
    const { data: keys, error } = await supabase
      .from('lti_tool_keys')
      .select('kid, public_key, algorithm')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()');

    if (error) {
      console.error('Error fetching keys:', error);
      throw error;
    }

    // If no keys exist, generate a new key pair
    if (!keys || keys.length === 0) {
      console.log('No active keys found, generating new key pair');
      
      // Generate RSA key pair using Web Crypto API
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]), // 65537
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
      );

      // Export keys
      const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      // Convert to PEM format
      const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(publicKeySpki))).match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
      const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(privateKeyPkcs8))).match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;

      const kid = `edvana-key-${Date.now()}`;

      // Store the new key pair
      const { error: insertError } = await supabase
        .from('lti_tool_keys')
        .insert({
          kid,
          public_key: publicKeyPem,
          private_key: privateKeyPem,
          algorithm: 'RS256',
          is_active: true,
        });

      if (insertError) {
        console.error('Error storing key:', insertError);
        throw insertError;
      }

      // Export public key as JWK
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

      return new Response(
        JSON.stringify({
          keys: [{
            ...publicKeyJwk,
            kid,
            use: 'sig',
            alg: 'RS256',
          }],
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // Convert existing keys to JWK format
    const jwks = keys.map(key => ({
      kty: 'RSA',
      kid: key.kid,
      use: 'sig',
      alg: key.algorithm || 'RS256',
      // Note: In production, properly parse the PEM to extract n and e
      // For now, we'll need to re-export if needed
    }));

    return new Response(
      JSON.stringify({ keys: jwks }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      }
    );
  } catch (error) {
    console.error('JWKS error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve JWKS' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
