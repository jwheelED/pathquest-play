import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY');

// Check if URL is a YouTube URL
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify instructor role
    const { data: hasRole } = await supabase.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'instructor' 
    });
    
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Only instructors can transcribe videos' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lectureVideoId, videoPath } = await req.json();

    if (!lectureVideoId) {
      return new Response(JSON.stringify({ error: 'Missing lectureVideoId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting transcription for lecture ${lectureVideoId}, path: ${videoPath}`);

    // Update status to processing
    await supabase
      .from('lecture_videos')
      .update({ status: 'processing' })
      .eq('id', lectureVideoId);

    // Fetch the lecture video record to check for external URL
    const { data: lectureVideo, error: fetchError } = await supabaseAdmin
      .from('lecture_videos')
      .select('video_url, video_path')
      .eq('id', lectureVideoId)
      .single();

    if (fetchError || !lectureVideo) {
      console.error('Failed to fetch lecture video:', fetchError);
      await supabase
        .from('lecture_videos')
        .update({ status: 'error', error_message: 'Failed to fetch lecture record' })
        .eq('id', lectureVideoId);
      throw new Error('Failed to fetch lecture video record');
    }

    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];
    let duration = 0;

    // Check if this is a YouTube URL - use caption extraction first, fallback to audio extraction
    if (lectureVideo.video_url && isYouTubeUrl(lectureVideo.video_url)) {
      console.log('Detected YouTube URL, trying caption extraction first...');
      console.log('Video URL:', lectureVideo.video_url);
      
      // Try caption extraction first (faster and cheaper)
      let ytResponse;
      let ytError = null;
      
      try {
        ytResponse = await fetch(`${supabaseUrl}/functions/v1/get-youtube-transcript`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ videoUrl: lectureVideo.video_url })
        });
        
        console.log('YouTube transcript response status:', ytResponse.status);
      } catch (fetchError) {
        console.error('Failed to call get-youtube-transcript:', fetchError);
        ytError = fetchError;
      }

      if (ytResponse?.ok) {
        const ytResult = await ytResponse.json();
        console.log('YouTube captions extracted:', ytResult.transcript?.length, 'segments');
        transcriptSegments = ytResult.transcript || [];
        duration = ytResult.duration || 0;
      } else {
        // Log the error from caption extraction
        if (ytResponse) {
          try {
            const ytErrorBody = await ytResponse.json();
            console.log('Caption extraction failed:', ytErrorBody);
          } catch (e) {
            console.log('Caption extraction failed with status:', ytResponse.status);
          }
        }
        
        // Captions not available - fallback to audio extraction via Cloudinary
        console.log('Captions not available, falling back to audio extraction...');
        
        await supabase
          .from('lecture_videos')
          .update({ status: 'processing', error_message: 'Extracting audio from YouTube...' })
          .eq('id', lectureVideoId);

        // Extract audio and upload to Cloudinary
        let audioResponse;
        try {
          audioResponse = await fetch(`${supabaseUrl}/functions/v1/extract-youtube-audio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`
            },
            body: JSON.stringify({ videoUrl: lectureVideo.video_url })
          });
          
          console.log('Audio extraction response status:', audioResponse.status);
        } catch (audioFetchError) {
          console.error('Failed to call extract-youtube-audio:', audioFetchError);
          await supabase
            .from('lecture_videos')
            .update({ status: 'error', error_message: 'Failed to connect to audio extraction service' })
            .eq('id', lectureVideoId);
          throw new Error('Failed to connect to audio extraction service');
        }

        if (!audioResponse.ok) {
          let audioError;
          try {
            audioError = await audioResponse.json();
          } catch (e) {
            audioError = { error: `Audio extraction failed with status ${audioResponse.status}` };
          }
          console.error('Audio extraction failed:', audioError);
          await supabase
            .from('lecture_videos')
            .update({ status: 'error', error_message: audioError.error || 'Failed to extract audio from YouTube' })
            .eq('id', lectureVideoId);
          throw new Error(audioError.error || 'Failed to extract audio');
        }

        const audioResult = await audioResponse.json();
        console.log('Audio extracted, now transcribing with Deepgram...');

        await supabase
          .from('lecture_videos')
          .update({ status: 'processing', error_message: 'Transcribing audio...' })
          .eq('id', lectureVideoId);

        // Send Cloudinary URL to Deepgram for transcription
        const deepgramResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&paragraphs=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: audioResult.audioUrl }),
        });

        if (!deepgramResponse.ok) {
          const errorText = await deepgramResponse.text();
          console.error('Deepgram error on YouTube audio:', errorText);
          await supabase
            .from('lecture_videos')
            .update({ status: 'error', error_message: 'Transcription service failed' })
            .eq('id', lectureVideoId);
          throw new Error(`Deepgram error: ${deepgramResponse.status}`);
        }

        const deepgramResult = await deepgramResponse.json();
        console.log('YouTube audio transcription complete');

        // Extract segments from Deepgram result
        const utterances = deepgramResult.results?.utterances || [];
        const paragraphs = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs || [];
        
        if (utterances.length > 0) {
          transcriptSegments = utterances.map((u: any) => ({
            start: u.start,
            end: u.end,
            text: u.transcript
          }));
        } else if (paragraphs.length > 0) {
          transcriptSegments = paragraphs.flatMap((p: any) => 
            p.sentences.map((s: any) => ({
              start: s.start,
              end: s.end,
              text: s.text
            }))
          );
        } else {
          const words = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
          if (words.length > 0) {
            const segmentDuration = 30;
            let currentSegment = { start: words[0].start, end: 0, text: '' };
            
            for (const word of words) {
              if (word.start - currentSegment.start > segmentDuration && currentSegment.text) {
                currentSegment.end = word.start;
                transcriptSegments.push({ ...currentSegment });
                currentSegment = { start: word.start, end: 0, text: '' };
              }
              currentSegment.text += (currentSegment.text ? ' ' : '') + word.word;
              currentSegment.end = word.end;
            }
            
            if (currentSegment.text) {
              transcriptSegments.push(currentSegment);
            }
          }
        }

        duration = transcriptSegments.length > 0 
          ? Math.ceil(transcriptSegments[transcriptSegments.length - 1].end)
          : deepgramResult.metadata?.duration || 0;
      }
      
    } else {
      // Use Deepgram for direct video URLs or uploaded files
      let transcriptionUrl: string;

      if (lectureVideo.video_url) {
        // External URL - use it directly with Deepgram
        console.log('Using external video URL:', lectureVideo.video_url);
        transcriptionUrl = lectureVideo.video_url;
      } else if (lectureVideo.video_path) {
        // Uploaded file - get signed URL from storage
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
          .storage
          .from('lecture-videos')
          .createSignedUrl(lectureVideo.video_path, 3600); // 1 hour expiry

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('Failed to get signed URL:', signedUrlError);
          await supabase
            .from('lecture_videos')
            .update({ status: 'error', error_message: 'Failed to access video file' })
            .eq('id', lectureVideoId);
          throw new Error('Failed to get signed URL for video');
        }
        transcriptionUrl = signedUrlData.signedUrl;
      } else {
        await supabase
          .from('lecture_videos')
          .update({ status: 'error', error_message: 'No video URL or file path provided' })
          .eq('id', lectureVideoId);
        throw new Error('No video URL or file path provided');
      }

      console.log('Got transcription URL, sending to Deepgram...');

      // Send to Deepgram for transcription with timestamps
      const deepgramResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&paragraphs=true', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: transcriptionUrl
        }),
      });

      if (!deepgramResponse.ok) {
        const errorText = await deepgramResponse.text();
        console.error('Deepgram error:', errorText);
        await supabase
          .from('lecture_videos')
          .update({ status: 'error', error_message: 'Transcription service failed' })
          .eq('id', lectureVideoId);
        throw new Error(`Deepgram error: ${deepgramResponse.status}`);
      }

      const deepgramResult = await deepgramResponse.json();
      console.log('Transcription complete');

      // Extract utterances with timestamps
      const utterances = deepgramResult.results?.utterances || [];
      const paragraphs = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs || [];
      
      if (utterances.length > 0) {
        transcriptSegments = utterances.map((u: any) => ({
          start: u.start,
          end: u.end,
          text: u.transcript
        }));
      } else if (paragraphs.length > 0) {
        transcriptSegments = paragraphs.flatMap((p: any) => 
          p.sentences.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text
          }))
        );
      } else {
        // Fallback to words if no utterances/paragraphs
        const words = deepgramResult.results?.channels?.[0]?.alternatives?.[0]?.words || [];
        if (words.length > 0) {
          // Group words into ~30 second segments
          const segmentDuration = 30;
          let currentSegment = { start: words[0].start, end: 0, text: '' };
          
          for (const word of words) {
            if (word.start - currentSegment.start > segmentDuration && currentSegment.text) {
              currentSegment.end = word.start;
              transcriptSegments.push({ ...currentSegment });
              currentSegment = { start: word.start, end: 0, text: '' };
            }
            currentSegment.text += (currentSegment.text ? ' ' : '') + word.word;
            currentSegment.end = word.end;
          }
          
          if (currentSegment.text) {
            transcriptSegments.push(currentSegment);
          }
        }
      }

      // Get duration from last segment or metadata
      duration = transcriptSegments.length > 0 
        ? Math.ceil(transcriptSegments[transcriptSegments.length - 1].end)
        : deepgramResult.metadata?.duration || 0;
    }

    console.log(`Extracted ${transcriptSegments.length} segments, duration: ${duration}s`);

    // Update lecture video with transcript
    const { error: updateError } = await supabase
      .from('lecture_videos')
      .update({ 
        transcript: transcriptSegments,
        duration_seconds: Math.ceil(duration),
        status: 'analyzing'
      })
      .eq('id', lectureVideoId);

    if (updateError) {
      console.error('Failed to update lecture video:', updateError);
      throw new Error('Failed to save transcript');
    }

    return new Response(JSON.stringify({ 
      success: true,
      segments: transcriptSegments.length,
      duration: Math.ceil(duration)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in transcribe-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to transcribe video';
    return new Response(JSON.stringify({ 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
