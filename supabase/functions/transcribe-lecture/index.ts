import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process base64 in chunks to prevent memory issues with large audio files
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Add request timeout handling
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000); // 30 second timeout

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get and verify user (simplified check to avoid rate limiting)
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('No user found');
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing transcription for user:', user.id);

    const { audio } = await req.json();
    
    // Input validation for security
    if (!audio || typeof audio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Audio data must be a non-empty base64 string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Estimate decoded size before processing
    // Base64 encoding increases size by ~33%, so decoded size is ~75% of encoded
    const estimatedDecodedSize = (audio.length * 3) / 4;
    const maxSize = 25 * 1024 * 1024; // 25MB limit
    
    if (estimatedDecodedSize > maxSize) {
      return new Response(
        JSON.stringify({ 
          error: `Audio file too large (estimated ${Math.round(estimatedDecodedSize / 1024 / 1024)}MB, maximum 25MB)`,
          retryable: false
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Processing audio data (estimated size: ${Math.round(estimatedDecodedSize / 1024 / 1024)}MB)...`);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Transcription service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode base64 with chunked processing to handle large files
    let bytes: Uint8Array;
    try {
      bytes = processBase64Chunks(audio);
    } catch (decodeError) {
      console.error('Base64 decode error:', decodeError);
      return new Response(
        JSON.stringify({ error: 'Invalid audio data. Please try recording again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if audio data is valid and has minimum size
    if (bytes.length < 1000) {
      console.log('Audio too small, returning empty result');
      return new Response(
        JSON.stringify({ text: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing audio: ${bytes.length} bytes`);

    // Prepare form data with proper audio file
    const formData = new FormData();
    
    // Create blob - cast buffer to ArrayBuffer for type compatibility  
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    
    // Try webm first, fallback to ogg if needed
    let blob: Blob;
    let filename: string;
    
    // Check file signature to determine actual format
    const signature = bytes.slice(0, 4);
    const signatureStr = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log('Audio signature:', signatureStr);
    
    // WebM signature: 1A 45 DF A3
    if (signature[0] === 0x1A && signature[1] === 0x45 && signature[2] === 0xDF && signature[3] === 0xA3) {
      blob = new Blob([buffer], { type: 'audio/webm' });
      filename = 'audio.webm';
      console.log('Detected WebM format');
    } else {
      // Fallback to ogg
      blob = new Blob([buffer], { type: 'audio/ogg' });
      filename = 'audio.ogg';
      console.log('Using OGG format as fallback');
    }
    
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    
    console.log('Sending to OpenAI:', { size: bytes.length, type: blob.type, filename });

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI Whisper API error:', {
        status: response.status,
        statusText: response.statusText,
        error: error,
        audioSize: bytes.length
      });
      
      // Parse error details for specific handling
      let errorType = 'transcription_failed';
      let errorMessage = 'Failed to transcribe audio. Please try again.';
      
      try {
        const errorData = JSON.parse(error);
        if (errorData.error) {
          if (errorData.error.type === 'insufficient_quota') {
            errorType = 'quota_exceeded';
            errorMessage = 'OpenAI API quota exceeded. Please check your billing settings.';
          } else if (errorData.error.code === 'invalid_api_key') {
            errorType = 'invalid_api_key';
            errorMessage = 'OpenAI API key is invalid. Please check configuration.';
          }
        }
      } catch (parseError) {
        console.error('Could not parse error details:', parseError);
      }
      
      // Return status code and error details
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          error_type: errorType,
          status: response.status
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await response.json();
    console.log('Transcription successful:', result.text.substring(0, 100));

    clearTimeout(timeoutId);

    return new Response(
      JSON.stringify({ text: result.text || '' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Transcription error:', error);
    
    // Check if error is due to timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(
        JSON.stringify({ 
          error: 'Request timeout - please try again',
          retryable: true 
        }),
        {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Better error messages with retry hints
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRetryable = errorMessage.includes('rate limit') || errorMessage.includes('timeout');
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        retryable: isRetryable
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});