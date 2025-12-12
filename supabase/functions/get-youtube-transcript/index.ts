import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


const YOUTUBE_API_KEY = Deno.env.get('AIzaSyBVAUlc5S8BbmZ4FaOsPem3CCMs7Hkzxnc');

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

// Parse SRT format captions
function parseSrtFormat(srt: string): { text: string; start: number; duration: number }[] {
  const segments: { text: string; start: number; duration: number }[] = [];
  const blocks = srt.trim().split(/\n\n+/);
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    
    // Find timestamp line (format: 00:00:00,000 --> 00:00:00,000)
    const timestampLine = lines.find(l => l.includes('-->'));
    if (!timestampLine) continue;
    
    const [startStr, endStr] = timestampLine.split('-->').map(s => s.trim());
    
    const parseTime = (timeStr: string): number => {
      const [time, ms] = timeStr.replace(',', '.').split('.');
      const [h, m, s] = time.split(':').map(Number);
      return h * 3600 + m * 60 + s + (parseFloat(`0.${ms}`) || 0);
    };
    
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    const textLines = lines.slice(lines.indexOf(timestampLine) + 1);
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    
    if (text) {
      segments.push({ text, start, duration: end - start });
    }
  }
  
  return segments;
}

// Method 0: Try YouTube Data API v3 first (for error detection)
const apiResult = await tryYouTubeDataApi(videoId);
if (apiResult?.error) {
  // Return specific error for better user messaging
  return { segments: [], fullText: '', error: apiResult.error } as any;
}


// Try multiple methods to fetch transcript
async function fetchYouTubeTranscript(videoId: string): Promise<{ segments: any[]; fullText: string } | null> {
  console.log('Fetching transcript for video:', videoId);
  
  // Method 1: Try fetching from the watch page (standard approach)
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const pageResponse = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!pageResponse.ok) {
      console.error('Failed to fetch YouTube page:', pageResponse.status);
      return null;
    }
    
    const html = await pageResponse.text();
  // Try YouTube Data API v3 (official method - requires API key)
async function tryYouTubeDataApi(videoId: string): Promise<{ segments: any[]; fullText: string; error?: string } | null> {
  if (!YOUTUBE_API_KEY) {
    console.log('No YOUTUBE_API_KEY configured, skipping Data API method');
    return null;
  }

  try {
    console.log('Trying YouTube Data API v3...');
    
    // Step 1: List available caption tracks
    const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`;
    const listResponse = await fetch(listUrl);
    
    if (!listResponse.ok) {
      const errorData = await listResponse.json();
      console.error('YouTube API list error:', listResponse.status, errorData);
      
      if (listResponse.status === 403) {
        const errorReason = errorData?.error?.errors?.[0]?.reason;
        if (errorReason === 'forbidden') {
          return { 
            segments: [], 
            fullText: '', 
            error: 'CAPTION_DOWNLOAD_DISABLED' 
          };
        }
        return { 
          segments: [], 
          fullText: '', 
          error: 'API_FORBIDDEN' 
        };
      }
      if (listResponse.status === 404) {
        return { 
          segments: [], 
          fullText: '', 
          error: 'VIDEO_NOT_FOUND' 
        };
      }
      if (listResponse.status === 429) {
        return { 
          segments: [], 
          fullText: '', 
          error: 'QUOTA_EXCEEDED' 
        };
      }
      return null;
    }
    
    const listData = await listResponse.json();
    const captionTracks = listData.items || [];
    
    if (captionTracks.length === 0) {
      console.log('No caption tracks found via Data API');
      return { segments: [], fullText: '', error: 'NO_CAPTIONS' };
    }
    
    console.log('Found', captionTracks.length, 'caption tracks via Data API');
    
    // Prefer English, then any manual captions, then auto-generated
    let selectedTrack = captionTracks.find((t: any) => 
      t.snippet?.language === 'en' && t.snippet?.trackKind !== 'ASR'
    );
    if (!selectedTrack) {
      selectedTrack = captionTracks.find((t: any) => t.snippet?.language === 'en');
    }
    if (!selectedTrack) {
      selectedTrack = captionTracks.find((t: any) => t.snippet?.trackKind !== 'ASR');
    }
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }
    
    const captionId = selectedTrack.id;
    console.log('Selected caption track:', captionId, selectedTrack.snippet?.language);
    
    // Step 2: Download the caption content
    // Note: This requires OAuth for most videos, so we'll use the timedtext approach instead
    // The Data API captions.download endpoint requires the video owner's OAuth token
    // Instead, we'll use the baseUrl from the Innertube API which doesn't require OAuth
    
    return null; // Fall through to other methods
    
  } catch (error) {
    console.error('YouTube Data API error:', error);
    return null;
  }
}

    
    // Try to find caption tracks in multiple ways
    let captionTracks: any[] = [];
    
    // Method 1a: Look for ytInitialPlayerResponse
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script>)/s);
    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        console.log('Found caption tracks via ytInitialPlayerResponse:', captionTracks.length);
      } catch (e) {
        console.log('Failed to parse ytInitialPlayerResponse');
      }
    }
    
    // Method 1b: Look for captions in the embedded player config
    if (captionTracks.length === 0) {
      const configMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (configMatch) {
        try {
          captionTracks = JSON.parse(configMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
          console.log('Found caption tracks via captionTracks array:', captionTracks.length);
        } catch (e) {
          console.log('Failed to parse captionTracks array');
        }
      }
    }
    
    // Method 1c: Look for timedtext URL directly
    if (captionTracks.length === 0) {
      const timedtextUrls = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"'\s\\]+/g);
      if (timedtextUrls && timedtextUrls.length > 0) {
        // Clean up the URL
        let captionUrl = timedtextUrls[0]
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '')
          .replace(/\\/g, '');
        captionTracks = [{ baseUrl: captionUrl }];
        console.log('Found timedtext URL directly');
      }
    }
    
    if (captionTracks.length === 0) {
      console.log('No caption tracks found in page');
      
      // Method 2: Try using the innertube API directly
      console.log('Trying innertube API...');
      const innertubeResult = await tryInnertubeApi(videoId);
      if (innertubeResult) {
        return innertubeResult;
      }
      
      return null;
    }
    
    // Prefer English captions, fall back to first available
    let selectedTrack = captionTracks.find((t: any) => 
      t.languageCode === 'en' || t.languageCode?.startsWith('en') || t.vssId?.includes('.en')
    );
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }
    
    const captionUrl = selectedTrack.baseUrl || selectedTrack.url;
    if (!captionUrl) {
      console.log('No caption URL found in track');
      return null;
    }
    
    console.log('Fetching captions from:', captionUrl.substring(0, 100) + '...');
    
    // Fetch the caption XML
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

// Try using YouTube's innertube API
async function tryInnertubeApi(videoId: string): Promise<{ segments: any[]; fullText: string } | null> {
  try {
    // First, get the video info to find caption tracks
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20231219.04.00',
            hl: 'en',
            gl: 'US'
          }
        },
        videoId: videoId
      })
    });
    
    if (!response.ok) {
      console.log('Innertube API request failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      console.log('No captions found via innertube API');
      return null;
    }
    
    console.log('Found', captionTracks.length, 'caption tracks via innertube');
    
    // Prefer English
    let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }
    
    const captionUrl = selectedTrack.baseUrl;
    if (!captionUrl) {
      return null;
    }
    
    // Fetch captions
    const captionResponse = await fetch(captionUrl);
    if (!captionResponse.ok) {
      return null;
    }
    
    const captionXml = await captionResponse.text();
    const segments = parseTimedTextXml(captionXml);
    
    if (segments.length === 0) {
      return null;
    }
    
    const fullText = segments.map(s => s.text).join(' ');
    const formattedSegments = segments.map(s => ({
      text: s.text,
      start: s.start,
      end: s.start + s.duration
    }));
    
    return { segments: formattedSegments, fullText };
    
  } catch (error) {
    console.error('Innertube API error:', error);
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
        message: 'This YouTube video does not have captions available. To fix this:\n\n1. Go to your YouTube video settings\n2. Enable "Allow auto-generated captions"\n3. Or add manual captions/subtitles\n4. Wait a few minutes for YouTube to process\n5. Try again\n\nAlternatively, upload the video file directly instead of using a YouTube link.'
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
