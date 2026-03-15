import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const authenticatedUserId = userData.user.id;
    // --- End auth check ---

    const { fileBase64, fileName, instructorId } = await req.json();

    if (!fileBase64 || !fileName || !instructorId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileBase64, fileName, instructorId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify instructorId matches authenticated user
    if (instructorId !== authenticatedUserId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: instructorId does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📄 Converting PPTX to PDF using CloudConvert: ${fileName}`);

    const apiKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing CloudConvert API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Create CloudConvert job
    console.log('📤 Creating CloudConvert job...');
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
      return new Response(
        JSON.stringify({ error: 'Failed to create conversion job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data.id;
    console.log('✅ Job created:', jobId);

    const importTask = jobData.data.tasks.find((t: Record<string, unknown>) => t.name === 'import-file');
    if (!importTask || !(importTask.result as Record<string, unknown>)?.form) {
      return new Response(
        JSON.stringify({ error: 'Failed to get upload URL from conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Upload file to CloudConvert
    console.log('📤 Uploading PPTX to CloudConvert...');
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });

    const uploadFormData = new FormData();
    const formResult = importTask.result as Record<string, unknown>;
    const formData = formResult.form as Record<string, unknown>;
    const formParams = (formData.parameters || {}) as Record<string, string>;
    for (const [key, value] of Object.entries(formParams)) {
      uploadFormData.append(key, value);
    }
    uploadFormData.append('file', blob, fileName);

    const uploadResponse = await fetch((formData.url as string), {
      method: 'POST',
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ File uploaded successfully');

    // Step 3: Poll for completion
    console.log('⏳ Waiting for conversion to complete...');
    let attempts = 0;
    const maxAttempts = 60;
    let completedJob = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!statusResponse.ok) {
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.data.status;

      if (status === 'finished') {
        completedJob = statusData.data;
        break;
      } else if (status === 'error') {
        const errorTask = statusData.data.tasks.find((t: Record<string, unknown>) => t.status === 'error');
        const errorMessage = (errorTask?.message as string) || 'Conversion failed';
        console.error('CloudConvert job failed:', errorMessage);
        return new Response(
          JSON.stringify({ error: `Conversion failed: ${errorMessage}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      attempts++;
    }

    if (!completedJob) {
      return new Response(
        JSON.stringify({ error: 'Conversion timed out. Please try again with a smaller file.' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Conversion completed');

    // Step 4: Get PDF download URL
    const exportTask = completedJob.tasks.find((t: Record<string, unknown>) => t.name === 'export-file');
    const exportResult = exportTask?.result as Record<string, unknown> | undefined;
    const exportFiles = exportResult?.files as Array<Record<string, unknown>> | undefined;
    if (!exportFiles?.[0]?.url) {
      return new Response(
        JSON.stringify({ error: 'Failed to get converted file from conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfUrl = exportFiles[0].url as string;
    console.log('📥 Downloading converted PDF...');

    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to download converted PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`✅ PDF downloaded, size: ${pdfBuffer.byteLength} bytes`);

    // Step 5: Upload PDF to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const pdfFileName = fileName.replace(/\.(pptx|ppt)$/i, '.pdf');
    const filePath = `${instructorId}/slides/${Date.now()}_${pdfFileName}`;

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
