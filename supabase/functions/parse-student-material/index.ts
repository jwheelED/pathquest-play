import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { materialId } = await req.json();

    if (!materialId) {
      return new Response(
        JSON.stringify({ error: 'Material ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch material details
    const { data: material, error: materialError } = await supabase
      .from('student_study_materials')
      .select('*')
      .eq('id', materialId)
      .single();

    if (materialError || !material) {
      throw new Error('Material not found');
    }

    let parsedContent = '';
    let contentType = material.material_type;

    // Handle different material types
    if (material.material_type === 'note') {
      // Text notes are already in content field
      parsedContent = material.content || '';
    } else if (material.material_type === 'video') {
      // For video URLs, we can't transcribe, so extract metadata
      parsedContent = `Video material: ${material.title}. ${material.description || ''}. Tags: ${material.subject_tags?.join(', ') || 'none'}.`;
    } else if (material.file_path) {
      // For files (images, PDFs, audio), we need to download and process
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('student-materials')
        .download(material.file_path);

      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      // Use Lovable AI to extract text from various file types
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      // For PDFs and images, convert to base64 and use vision
      if (material.material_type === 'pdf' || material.material_type === 'image') {
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const mimeType = material.material_type === 'pdf' ? 'application/pdf' : 'image/jpeg';

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
                    text: 'Extract all text content from this document. Include any important information, formulas, concepts, or key points. Format as plain text with clear sections.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64}`
                    }
                  }
                ]
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('AI extraction error:', aiResponse.status, errorText);
          throw new Error('Failed to extract content from file');
        }

        const aiData = await aiResponse.json();
        parsedContent = aiData.choices[0].message.content;
      } else if (material.material_type === 'audio') {
        // For audio, we'd need transcription - for now, use metadata
        parsedContent = `Audio material: ${material.title}. ${material.description || ''}. Tags: ${material.subject_tags?.join(', ') || 'none'}.`;
      }
    }

    // Store or return parsed content
    console.log('Parsed content length:', parsedContent.length);
    console.log('Material type:', contentType);

    return new Response(
      JSON.stringify({
        success: true,
        materialId,
        contentType,
        parsedContent,
        contentLength: parsedContent.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Parse error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
