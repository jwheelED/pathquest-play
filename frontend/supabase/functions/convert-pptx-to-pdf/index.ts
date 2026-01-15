import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log(`📄 Converting PPTX to PDF: ${fileName}`);

    // Get Cloudinary credentials
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Missing Cloudinary credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing Cloudinary credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Cloudinary upload signature
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'pptx_conversions';
    
    // Upload PPTX to Cloudinary as raw file
    const formData = new FormData();
    
    // Convert base64 to blob
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    
    formData.append('file', blob, fileName);
    formData.append('upload_preset', 'ml_default');
    formData.append('resource_type', 'raw');
    formData.append('folder', folder);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());

    console.log('📤 Uploading PPTX to Cloudinary...');
    
    // Upload the PPTX file
    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to conversion service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('✅ PPTX uploaded, public_id:', uploadResult.public_id);

    // Get the PDF version URL using Cloudinary's document transformation
    // Cloudinary converts office documents to PDF using the 'fl_attachment' and format conversion
    const pdfUrl = uploadResult.secure_url.replace(/\.[^/.]+$/, '.pdf');
    
    // For raw uploads, we need to use the Cloudinary Document API
    // Construct the PDF delivery URL
    const publicId = uploadResult.public_id;
    const pdfDeliveryUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}.pdf`;

    console.log('📥 Fetching converted PDF from:', pdfDeliveryUrl);

    // Try fetching the PDF (Cloudinary auto-converts on delivery)
    const pdfResponse = await fetch(pdfDeliveryUrl);
    
    if (!pdfResponse.ok) {
      // Fallback: Try the raw URL with format conversion
      const altPdfUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/fl_attachment/${publicId}.pdf`;
      console.log('Trying alternative URL:', altPdfUrl);
      
      const altResponse = await fetch(altPdfUrl);
      if (!altResponse.ok) {
        console.error('PDF conversion/fetch failed');
        return new Response(
          JSON.stringify({ error: 'Failed to convert PPTX to PDF. The file may be corrupted or password-protected.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`✅ PDF fetched, size: ${pdfBuffer.byteLength} bytes`);

    // Upload PDF to Supabase Storage
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

    // Clean up Cloudinary file (optional, to save storage)
    try {
      // Note: Deletion requires signed request, skipping for now
      console.log('🧹 Cloudinary cleanup skipped (file will auto-expire based on settings)');
    } catch (e) {
      console.log('Cloudinary cleanup error (non-critical):', e);
    }

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
