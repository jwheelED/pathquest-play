import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl } = await req.json();
    
    if (!videoUrl) {
      throw new Error('Video URL is required');
    }

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log(`Extracting audio for video: ${videoId}`);

    // Step 1: Get audio download URL from RapidAPI
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      console.error('RAPIDAPI_KEY is not set in Supabase secrets');
      throw new Error('RAPIDAPI_KEY not configured. Please add it to Supabase Edge Function secrets.');
    }

    console.log('RapidAPI key found, requesting audio URL...');
    const audioUrl = await getYouTubeAudioUrl(videoId, rapidApiKey);
    console.log('Got audio URL from RapidAPI');

    // Step 2: Download audio and upload to Cloudinary
    console.log('Uploading to Cloudinary...');
    const cloudinaryUrl = await uploadToCloudinary(audioUrl, videoId);
    console.log('Uploaded to Cloudinary:', cloudinaryUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        audioUrl: cloudinaryUrl,
        videoId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error extracting YouTube audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getYouTubeAudioUrl(videoId: string, apiKey: string): Promise<string> {
  // Using YouTube MP3 Download API from RapidAPI
  console.log(`Calling RapidAPI for video ID: ${videoId}`);
  
  const response = await fetch(
    `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
      }
    }
  );

  console.log('RapidAPI response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('RapidAPI error response:', errorText);
    
    if (response.status === 401 || response.status === 403) {
      throw new Error('RapidAPI authentication failed. Please check your RAPIDAPI_KEY is valid and has an active subscription.');
    }
    if (response.status === 429) {
      throw new Error('RapidAPI rate limit exceeded. Please try again later or upgrade your plan.');
    }
    throw new Error(`RapidAPI request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('RapidAPI response data:', JSON.stringify(data).substring(0, 200));
  
  if (data.status !== 'ok' || !data.link) {
    console.error('RapidAPI response indicates failure:', data);
    
    if (data.status === 'processing') {
      throw new Error('Video is still being processed by RapidAPI. Please try again in a few moments.');
    }
    if (data.msg?.includes('private') || data.msg?.includes('unavailable')) {
      throw new Error('This YouTube video is private or unavailable. Please use a public video.');
    }
    throw new Error(data.msg || 'Failed to extract audio from YouTube. The video may be too long or restricted.');
  }

  return data.link;
}

async function uploadToCloudinary(audioUrl: string, videoId: string): Promise<string> {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!cloudName) {
    console.error('CLOUDINARY_CLOUD_NAME is not set');
    throw new Error('CLOUDINARY_CLOUD_NAME not configured in Supabase secrets');
  }
  if (!apiKey) {
    console.error('CLOUDINARY_API_KEY is not set');
    throw new Error('CLOUDINARY_API_KEY not configured in Supabase secrets');
  }
  if (!apiSecret) {
    console.error('CLOUDINARY_API_SECRET is not set');
    throw new Error('CLOUDINARY_API_SECRET not configured in Supabase secrets');
  }

  console.log(`Uploading to Cloudinary cloud: ${cloudName}`);

  // Generate signature for upload
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `youtube_audio_${videoId}_${timestamp}`;
  
  // Create signature
  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Upload to Cloudinary using URL
  const formData = new FormData();
  formData.append('file', audioUrl);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('public_id', publicId);
  formData.append('resource_type', 'video'); // Audio files use 'video' resource type

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    {
      method: 'POST',
      body: formData
    }
  );

  console.log('Cloudinary upload response status:', uploadResponse.status);

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Cloudinary upload error:', errorText);
    
    if (uploadResponse.status === 401) {
      throw new Error('Cloudinary authentication failed. Please check your API credentials.');
    }
    throw new Error(`Cloudinary upload failed: ${uploadResponse.status}`);
  }

  const uploadResult = await uploadResponse.json();
  
  if (!uploadResult.secure_url) {
    console.error('Cloudinary response missing URL:', uploadResult);
    throw new Error('Cloudinary did not return a URL');
  }

  return uploadResult.secure_url;
}
