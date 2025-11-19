import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'NO_API_KEY',
          message: 'Deepgram API key is not configured in edge function secrets.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Test the API key by fetching available models
    // This is a lightweight endpoint that requires authentication
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Deepgram API validation failed:', response.status, errorText);
      
      let error = 'UNKNOWN_ERROR';
      let message = 'Failed to validate Deepgram API key.';
      
      if (response.status === 401) {
        error = 'INVALID_API_KEY';
        message = 'The Deepgram API key is invalid or expired. Please check your API key in the Deepgram console.';
      } else if (response.status === 402) {
        error = 'BILLING_REQUIRED';
        message = 'Deepgram billing is not set up. Please add payment information in your Deepgram account at console.deepgram.com to use the streaming API.';
      } else if (response.status === 403) {
        error = 'INSUFFICIENT_PERMISSIONS';
        message = 'The API key does not have sufficient permissions. Please create a new API key with full access.';
      }
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error,
          message,
          statusCode: response.status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const data = await response.json();
    console.log('✅ Deepgram API key validated successfully');
    
    return new Response(
      JSON.stringify({ 
        valid: true, 
        message: 'Deepgram API key is valid and ready to use.',
        projectCount: data.projects?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error validating Deepgram API key:', error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: 'VALIDATION_ERROR',
        message: `Failed to validate API key: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
