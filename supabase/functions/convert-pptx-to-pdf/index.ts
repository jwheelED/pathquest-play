import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, instructorId } = await req.json();

    if (!fileBase64 || !fileName || !instructorId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileBase64, fileName, instructorId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📄 Converting PPTX to PDF using CloudConvert: ${fileName}`);

    // Get CloudConvert API key
    const apiKey = Deno.env.get('CLOUDCONVERT_API_KEY');

    if (!apiKey) {
      console.error('Missing CloudConvert API key');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing CloudConvert API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Create a CloudConvert job with import, convert, and export tasks
    console.log('📤 Creating CloudConvert job...');
    
    const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-file': {
            operation: 'import/upload',
          },
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
      return new Response(
        JSON.stringify({ error: 'Failed to create conversion job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data.id;
    console.log('✅ Job created:', jobId);

    // Find the import task to get the upload URL
    const importTask = jobData.data.tasks.find((t: any) => t.name === 'import-file');
    if (!importTask || !importTask.result?.form?.url) {
      console.error('Import task not found or missing upload URL');
      return new Response(
        JSON.stringify({ error: 'Failed to get upload URL from conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Upload the file to CloudConvert
    console.log('📤 Uploading PPTX to CloudConvert...');
    
    // Convert base64 to blob
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });

    // Build FormData for upload
    const uploadFormData = new FormData();
    
    // Add all form parameters from CloudConvert
    const formParams = importTask.result.form.parameters || {};
    for (const [key, value] of Object.entries(formParams)) {
      uploadFormData.append(key, value as string);
    }
    uploadFormData.append('file', blob, fileName);

    const uploadResponse = await fetch(importTask.result.form.url, {
      method: 'POST',
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('CloudConvert upload failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ File uploaded successfully');

    // Step 3: Poll for job completion
    console.log('⏳ Waiting for conversion to complete...');
    
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    let completedJob = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        console.error('Failed to check job status');
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.data.status;

      if (status === 'finished') {
        completedJob = statusData.data;
        break;
      } else if (status === 'error') {
        const errorTask = statusData.data.tasks.find((t: any) => t.status === 'error');
        const errorMessage = errorTask?.message || 'Conversion failed';
        console.error('CloudConvert job failed:', errorMessage);
        return new Response(
          JSON.stringify({ error: `Conversion failed: ${errorMessage}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      attempts++;
    }

    if (!completedJob) {
      console.error('Conversion timed out');
      return new Response(
        JSON.stringify({ error: 'Conversion timed out. Please try again with a smaller file.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Conversion completed');

    // Step 4: Get the PDF download URL from the export task
    const exportTask = completedJob.tasks.find((t: any) => t.name === 'export-file');
    if (!exportTask || !exportTask.result?.files?.[0]?.url) {
      console.error('Export task not found or missing download URL');
      return new Response(
        JSON.stringify({ error: 'Failed to get converted file from conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfUrl = exportTask.result.files[0].url;
    console.log('📥 Downloading converted PDF...');

    // Step 5: Download the PDF
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      console.error('Failed to download PDF');
      return new Response(
        JSON.stringify({ error: 'Failed to download converted PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`✅ PDF downloaded, size: ${pdfBuffer.byteLength} bytes`);

    // Step 6: Upload PDF to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const pdfFileName = fileName.replace(/\.(pptx|ppt)$/i, '.pdf');
    const filePath = `${instructorId}/slides/${Date.now()}_${pdfFileName}`;

    console.log('📤 Uploading PDF to Supabase Storage:', filePath);

    const { error: storageError } = await supabase.storage
      .from('lecture-materials')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) {
      console.error('Supabase storage error:', storageError);
      return new Response(
        JSON.stringify({ error: 'Failed to save converted PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ PDF saved to Supabase Storage');

    return new Response(
      JSON.stringify({
        success: true,
        filePath,
        originalName: fileName,
        convertedName: pdfFileName,
        fileSize: pdfBuffer.byteLength,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in convert-pptx-to-pdf:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
