import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

/**
 * Background PPTX to PDF conversion for hybrid mode
 * Converts PPTX files that were uploaded with "preserve animations" 
 * to enable slide question extraction while keeping the original PPTX for presentation
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { materialId, filePath, instructorId } = await req.json();

    if (!materialId || !filePath || !instructorId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: materialId, filePath, instructorId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔄 Starting background PPTX conversion for material: ${materialId}`);

    // Update status to processing
    await supabase
      .from('lecture_materials')
      .update({ pdf_conversion_status: 'processing' })
      .eq('id', materialId);

    // Get CloudConvert API key
    const apiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    if (!apiKey) {
      console.error('Missing CloudConvert API key');
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the PPTX file from storage
    console.log('📥 Downloading PPTX from storage:', filePath);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('lecture-materials')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Failed to download PPTX:', downloadError);
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to download file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert blob to array buffer for base64 encoding
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const fileBase64 = btoa(binary);

    console.log('📤 Creating CloudConvert job...');

    // Create CloudConvert job
    const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/upload' },
          'convert-file': {
            operation: 'convert',
            input: ['import-file'],
            input_format: 'pptx',
            output_format: 'pdf',
          },
          'export-file': {
            operation: 'export/url',
            input: ['convert-file'],
          },
        },
      }),
    });

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      console.error('CloudConvert job creation failed:', errorText);
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to create conversion job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data.id;
    console.log('✅ Job created:', jobId);

    // Get upload URL from import task
    const importTask = jobData.data.tasks.find((t: any) => t.name === 'import-file');
    if (!importTask?.result?.form?.url) {
      console.error('Import task missing upload URL');
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to get upload URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload to CloudConvert
    console.log('📤 Uploading to CloudConvert...');
    const binaryData = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const blob = new Blob([binaryData], { 
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
    });

    const uploadFormData = new FormData();
    const formParams = importTask.result.form.parameters || {};
    for (const [key, value] of Object.entries(formParams)) {
      uploadFormData.append(key, value as string);
    }
    
    const fileName = filePath.split('/').pop() || 'presentation.pptx';
    uploadFormData.append('file', blob, fileName);

    const uploadResponse = await fetch(importTask.result.form.url, {
      method: 'POST',
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      console.error('CloudConvert upload failed');
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('⏳ Waiting for conversion...');

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 90; // 90 seconds timeout
    let completedJob = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const status = statusData.data.status;

        if (status === 'finished') {
          completedJob = statusData.data;
          break;
        } else if (status === 'error') {
          console.error('CloudConvert job failed');
          await supabase
            .from('lecture_materials')
            .update({ pdf_conversion_status: 'failed' })
            .eq('id', materialId);
          return new Response(
            JSON.stringify({ error: 'Conversion failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      attempts++;
    }

    if (!completedJob) {
      console.error('Conversion timed out');
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Conversion timed out' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get PDF download URL
    const exportTask = completedJob.tasks.find((t: any) => t.name === 'export-file');
    const pdfUrl = exportTask?.result?.files?.[0]?.url;
    
    if (!pdfUrl) {
      console.error('No PDF URL in export task');
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to get PDF URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the PDF
    console.log('📥 Downloading converted PDF...');
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to download PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`✅ PDF downloaded: ${pdfBuffer.byteLength} bytes`);

    // Upload PDF to Supabase Storage (alongside the original PPTX)
    const pdfFileName = fileName.replace(/\.(pptx|ppt)$/i, '_fallback.pdf');
    const pdfPath = `${instructorId}/slides/${Date.now()}_${pdfFileName}`;

    console.log('📤 Uploading PDF fallback to storage:', pdfPath);

    const { error: storageError } = await supabase.storage
      .from('lecture-materials')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) {
      console.error('Failed to upload PDF:', storageError);
      await supabase
        .from('lecture_materials')
        .update({ pdf_conversion_status: 'failed' })
        .eq('id', materialId);
      return new Response(
        JSON.stringify({ error: 'Failed to save PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the material record with the PDF fallback path
    const { error: updateError } = await supabase
      .from('lecture_materials')
      .update({ 
        pdf_fallback_path: pdfPath,
        pdf_conversion_status: 'completed'
      })
      .eq('id', materialId);

    if (updateError) {
      console.error('Failed to update material record:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Background PPTX conversion completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        pdfFallbackPath: pdfPath,
        materialId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in convert-pptx-background:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
