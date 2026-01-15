import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert ArrayBuffer to Base64 in chunks to avoid stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process 8KB at a time
  let binary = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

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

    console.log(`Processing material ${materialId}`);

    // Fetch material details
    const { data: material, error: materialError } = await supabase
      .from('student_study_materials')
      .select('*')
      .eq('id', materialId)
      .single();

    if (materialError || !material) {
      console.error('Material not found:', materialError);
      throw new Error('Material not found');
    }

    console.log('Material details:', {
      id: material.id,
      type: material.material_type,
      title: material.title,
      hasFilePath: !!material.file_path,
      hasContent: !!material.content,
    });

    let parsedContent = '';
    let contentType = material.material_type;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

    // Handle different material types
    if (material.material_type === 'note') {
      // Text notes are already in content field
      parsedContent = material.content || '';
    } else if (material.material_type === 'video') {
      // For video URLs, we can't transcribe, so extract metadata
      parsedContent = `Video material: ${material.title}. ${material.description || ''}. Tags: ${material.subject_tags?.join(', ') || 'none'}.`;
    } else if (material.file_path) {
      // For files (images, PDFs, audio), we need to download and process
      console.log(`Downloading file from: ${material.file_path}`);
      
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('student-materials')
        .download(material.file_path);

      if (downloadError) {
        console.error('Download error:', downloadError);
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      // Check file size
      const arrayBuffer = await fileData.arrayBuffer();
      console.log(`File size: ${arrayBuffer.byteLength} bytes`);

      if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
        console.warn(`File too large (${arrayBuffer.byteLength} bytes), using metadata fallback`);
        parsedContent = `Study Material: ${material.title}\nType: ${material.material_type}\nDescription: ${material.description || 'No description provided'}\nTopics: ${material.subject_tags?.join(', ') || 'General'}\n\nNote: This is a large file. Questions are generated from metadata. For better results, add a detailed description when uploading.`;
      } else {
        // Use Lovable AI to extract text from various file types
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) {
          throw new Error('LOVABLE_API_KEY not configured');
        }

        // For PDFs and images, convert to base64 and use vision
        if (material.material_type === 'pdf' || material.material_type === 'image') {
          console.log('Converting to base64 using chunked processing...');
          const base64 = arrayBufferToBase64(arrayBuffer);
          const mimeType = material.material_type === 'pdf' ? 'application/pdf' : 'image/jpeg';
          console.log(`Base64 conversion complete, length: ${base64.length}`);

          console.log('Calling Lovable AI for content extraction...');
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3-pro-preview',
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
            throw new Error(`Failed to extract content from file: ${aiResponse.status} ${errorText}`);
          }

          const aiData = await aiResponse.json();
          parsedContent = aiData.choices[0].message.content;
          console.log(`AI extraction successful, content length: ${parsedContent.length}`);
        } else if (material.material_type === 'audio') {
          // For audio, we'd need transcription - for now, use metadata
          parsedContent = `Audio material: ${material.title}. ${material.description || ''}. Tags: ${material.subject_tags?.join(', ') || 'none'}.`;
          console.log('Using metadata for audio file');
        }
      }
    }

    // Store or return parsed content
    console.log('Successfully parsed material:', {
      materialId,
      contentType,
      contentLength: parsedContent.length,
      preview: parsedContent.substring(0, 100),
    });

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
    console.error('Parse error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to parse material',
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
