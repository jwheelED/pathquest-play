import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate file magic bytes against expected file type
function validateMagicBytes(bytes: Uint8Array, fileExt: string): boolean {
  // Check first few bytes of file to verify actual file type
  if (bytes.length < 4) return false;

  const header = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  switch (fileExt) {
    case 'pdf':
      // PDF: %PDF (25 50 44 46)
      return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    
    case 'docx':
    case 'pptx':
      // Office Open XML: PK (50 4B) - ZIP format
      return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    
    case 'doc':
    case 'ppt':
      // Legacy Office: D0 CF 11 E0 A1 B1 1A E1 (Compound File Binary)
      return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
    
    case 'txt':
      // Text files: Allow any content (no specific magic bytes)
      return true;
    
    default:
      return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { filePath } = await req.json();
    
    // Input validation for security
    if (!filePath || typeof filePath !== 'string') {
      return new Response(
        JSON.stringify({ error: 'File path must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate file path length
    if (filePath.length > 500) {
      return new Response(
        JSON.stringify({ error: 'File path exceeds maximum length of 500 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Prevent path traversal attacks
    if (filePath.includes('..') || filePath.includes('//') || filePath.startsWith('/')) {
      return new Response(
        JSON.stringify({ error: 'Invalid file path format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate file extension
    const allowedExtensions = ['txt', 'pdf', 'doc', 'docx', 'ppt', 'pptx'];
    const fileExt = filePath.split('.').pop()?.toLowerCase();
    
    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      return new Response(
        JSON.stringify({ error: `File type not supported. Allowed: ${allowedExtensions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Downloading file:', filePath);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('lecture-materials')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Server-side file validation: Check magic bytes to verify file type
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Validate magic bytes match declared extension
    const magicByteValid = validateMagicBytes(bytes, fileExt);
    if (!magicByteValid) {
      console.error('File magic bytes do not match extension:', fileExt);
      return new Response(
        JSON.stringify({ error: 'File type mismatch: content does not match file extension' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle text files directly
    if (fileExt === 'txt') {
      const text = await fileData.text();
      console.log('Extracted text length:', text.length);
      return new Response(
        JSON.stringify({ text: text.slice(0, 10000) }), // Limit to 10k chars
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For PDF and Office files, use Lovable AI to extract text
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert file to base64 for AI processing (arrayBuffer already loaded above)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log('Sending to AI for text extraction, file size:', arrayBuffer.byteLength);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text content from this document. Return ONLY the extracted text, no additional commentary. Focus on lecture content, key concepts, definitions, examples, and explanations.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/${fileExt};base64,${base64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to parse document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const extractedText = aiData.choices?.[0]?.message?.content;

    if (!extractedText) {
      return new Response(
        JSON.stringify({ error: 'No text extracted from document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully extracted text, length:', extractedText.length);

    // Limit to 10k characters to avoid token limits
    return new Response(
      JSON.stringify({ text: extractedText.slice(0, 10000) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-lecture-material:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});