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
      throw new Error('RAPIDAPI_KEY not configured');
    }

    const audioUrl = await getYouTubeAudioUrl(videoId, rapidApiKey);
    console.log('Got audio URL from RapidAPI');

    // Step 2: Download audio and upload to Cloudinary
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
  const response = await fetch(
    `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('RapidAPI error:', errorText);
    throw new Error(`RapidAPI request failed: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.status !== 'ok' || !data.link) {
    console.error('RapidAPI response:', data);
    throw new Error(data.msg || 'Failed to extract audio from YouTube');
  }

  return data.link;
}

async function uploadToCloudinary(audioUrl: string, videoId: string): Promise<string> {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }

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

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Cloudinary upload error:', errorText);
    throw new Error(`Cloudinary upload failed: ${uploadResponse.status}`);
  }

  const uploadResult = await uploadResponse.json();
  
  if (!uploadResult.secure_url) {
    throw new Error('Cloudinary did not return a URL');
  }

  return uploadResult.secure_url;
}
