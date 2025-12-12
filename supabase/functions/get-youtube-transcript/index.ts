import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch available caption tracks for a video
async function getCaptionTracks(videoId: string): Promise<any[]> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // Extract captions data from the page
    const captionsMatch = html.match(/"captions":\s*(\{[^}]+\})/);
    if (!captionsMatch) {
      // Try alternative pattern for playerCaptionsTracklistRenderer
      const altMatch = html.match(/playerCaptionsTracklistRenderer":\s*(\{.+?\})\s*,\s*"videoDetails/s);
      if (!altMatch) {
        console.log('No captions data found in page');
        return [];
      }
    }
    
    // Look for timedtext URL in the page
    const timedtextMatch = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"]+/g);
    if (timedtextMatch && timedtextMatch.length > 0) {
      // Clean up the URL (unescape)
      const captionUrl = timedtextMatch[0].replace(/\\u0026/g, '&');
      return [{ url: captionUrl }];
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching caption tracks:', error);
    return [];
  }
}

// Parse YouTube's timedtext XML format
function parseTimedTextXml(xml: string): { text: string; start: number; duration: number }[] {
  const segments: { text: string; start: number; duration: number }[] = [];
  
  // Match <text> elements with start and dur attributes
  const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let match;
  
  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    // Decode HTML entities
    const text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    
    if (text) {
      segments.push({ text, start, duration });
    }
  }
  
  return segments;
}

// Fetch transcript using YouTube's internal API
async function fetchYouTubeTranscript(videoId: string): Promise<{ segments: any[]; fullText: string } | null> {
  console.log('Fetching transcript for video:', videoId);
  
  // Try fetching the video page to get caption URLs
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const pageResponse = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!pageResponse.ok) {
      console.error('Failed to fetch YouTube page:', pageResponse.status);
      return null;
    }
    
    const html = await pageResponse.text();
    
    // Extract the captionTracks from ytInitialPlayerResponse
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerResponseMatch) {
      console.log('Could not find ytInitialPlayerResponse');
      return null;
    }
    
    let playerResponse;
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
    } catch (e) {
      console.error('Failed to parse player response:', e);
      return null;
    }
    
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      console.log('No caption tracks available for this video');
      return null;
    }
    
    console.log('Found caption tracks:', captionTracks.length);
    
    // Prefer English captions, fall back to first available
    let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }
    
    console.log('Using caption track:', selectedTrack.languageCode, selectedTrack.name?.simpleText);
    
    // Fetch the caption XML
    const captionUrl = selectedTrack.baseUrl;
    const captionResponse = await fetch(captionUrl);
    
    if (!captionResponse.ok) {
      console.error('Failed to fetch captions:', captionResponse.status);
      return null;
    }
    
    const captionXml = await captionResponse.text();
    const segments = parseTimedTextXml(captionXml);
    
    if (segments.length === 0) {
      console.log('No segments parsed from captions');
      return null;
    }
    
    console.log('Parsed', segments.length, 'caption segments');
    
    // Build full text
    const fullText = segments.map(s => s.text).join(' ');
    
    // Convert to our transcript format
    const formattedSegments = segments.map(s => ({
      text: s.text,
      start: s.start,
      end: s.start + s.duration
    }));
    
    return { segments: formattedSegments, fullText };
    
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl } = await req.json();
    
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: 'Missing videoUrl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Extracting transcript for video ID:', videoId);
    
    const result = await fetchYouTubeTranscript(videoId);
    
    if (!result) {
      return new Response(JSON.stringify({ 
        error: 'No captions available',
        message: 'This YouTube video does not have captions available. Please enable auto-generated captions on the video or upload the video file directly.'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate duration from last segment
    const lastSegment = result.segments[result.segments.length - 1];
    const duration = lastSegment ? lastSegment.end : 0;

    return new Response(JSON.stringify({
      success: true,
      transcript: result.segments,
      fullText: result.fullText,
      duration: Math.round(duration)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in get-youtube-transcript:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
