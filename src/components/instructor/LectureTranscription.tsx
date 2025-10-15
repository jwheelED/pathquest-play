import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Radio, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LectureTranscriptionProps {
  onQuestionGenerated: () => void;
}

export const LectureTranscription = ({ onQuestionGenerated }: LectureTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptBufferRef = useRef<string>("");
  const triggerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    // Monitor transcript for voice command "generate question now" with optimized detection
    const triggerPhrase = "generate question now";
    const transcriptLower = transcript.toLowerCase();
    
    if (isRecording && transcriptLower.includes(triggerPhrase) && !hasTriggeredRef.current) {
      console.log('🎯 Voice command detected - generating questions instantly!');
      hasTriggeredRef.current = true;
      
      // Clear any pending debounce
      if (triggerDebounceRef.current) {
        clearTimeout(triggerDebounceRef.current);
      }
      
      // Remove trigger phrase from transcript
      const triggerIndex = transcriptLower.indexOf(triggerPhrase);
      const cleanedTranscript = transcript.slice(0, triggerIndex) + transcript.slice(triggerIndex + triggerPhrase.length);
      transcriptBufferRef.current = cleanedTranscript.trim();
      setTranscript(cleanedTranscript.trim());
      
      // Trigger immediately with voice command flag
      handleGenerateQuestions(true);
      
      // Reset trigger flag after 5 seconds to allow another trigger
      triggerDebounceRef.current = setTimeout(() => {
        hasTriggeredRef.current = false;
      }, 5000);
    }
  }, [transcript, isRecording]);

  const startRecording = async () => {
    try {
      // Reset trigger flag but keep transcript to accumulate across recording sessions
      hasTriggeredRef.current = false;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      // Try to use the best available audio format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg;codecs=opus';
      }
      
      console.log('Using audio format:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          console.log('Audio data available:', event.data.size, 'bytes');
          // Process each chunk immediately as it becomes available
          const audioBlob = new Blob([event.data], { type: mimeType });
          await processAudioChunk(audioBlob);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped');
      };

      // Start recording with 10-second chunks for better transcription quality
      mediaRecorder.start(10000);
      setIsRecording(true);
      toast({ 
        title: "🎙️ Recording started", 
        description: "Say 'generate question now' anytime to create questions instantly"
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({ title: "Failed to start recording", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      setIsRecording(false);
      toast({ title: "Recording stopped" });
    }
  };

  const processAudioChunk = async (audioBlob: Blob) => {
    try {
      // Validate audio blob - require minimum size
      if (!audioBlob || audioBlob.size < 1000) {
        console.warn('Audio chunk too small, skipping:', audioBlob.size);
        return;
      }

      console.log('Processing audio chunk:', audioBlob.size, 'bytes, type:', audioBlob.type);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        if (!base64Audio) {
          console.error('Failed to convert audio to base64');
          return;
        }

        try {
          const { data, error } = await supabase.functions.invoke('transcribe-lecture', {
            body: { audio: base64Audio }
          });

          if (error) {
            console.error('Transcription error:', error);
            // Only show toast for critical errors, not for empty responses
            if (error.message && !error.message.includes('too small')) {
              toast({ 
                title: "Transcription error", 
                description: "Please ensure your microphone is working properly.",
                variant: "destructive" 
              });
            }
            return;
          }
          
          if (data?.text && data.text.trim()) {
            transcriptBufferRef.current += " " + data.text.trim();
            setTranscript(transcriptBufferRef.current.trim());
            console.log('Transcribed:', data.text.substring(0, 100));
          } else {
            console.log('No transcription result (audio may be silence)');
          }
        } catch (invokeError) {
          console.error('Function invoke error:', invokeError);
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error:', reader.error);
      };
    } catch (error) {
      console.error('Transcription processing error:', error);
    }
  };

  const handleGenerateQuestions = async (isVoiceCommand = false) => {
    // For voice commands, allow shorter transcripts; for manual, require more content
    const minLength = isVoiceCommand ? 20 : 50;
    
    if (!transcript.trim() || transcript.length < minLength) {
      toast({ title: "Not enough content", description: "Continue lecturing to generate questions" });
      return;
    }

    setIsProcessing(true);
    
    // Show instant feedback
    toast({ 
      title: "⚡ Generating questions...", 
      description: "Processing your lecture content"
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get course context from instructor profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('course_title, course_topics')
        .eq('id', user.id)
        .single();

      // Use full accumulated transcript (up to 5000 chars for better context)
      const fullTranscript = transcript.slice(-5000);

      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-lecture-questions', {
        body: { 
          transcript: fullTranscript,
          courseContext: profile || {},
        }
      });

      if (functionError) throw functionError;

      // Save to review queue with full context snippet
      const { error: insertError } = await supabase
        .from('lecture_questions')
        .insert([{
          instructor_id: user.id,
          transcript_snippet: transcript.slice(-1000),
          questions: functionData.questions,
          status: 'pending'
        }]);

      if (insertError) throw insertError;

      toast({ 
        title: "✅ Questions generated!", 
        description: "Check review queue to send to students" 
      });
      
      onQuestionGenerated();
    } catch (error: any) {
      console.error('Question generation error:', error);
      toast({ 
        title: "Failed to generate questions", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    transcriptBufferRef.current = "";
    hasTriggeredRef.current = false;
    toast({ title: "Transcript cleared" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isRecording ? <Radio className="h-5 w-5 text-red-500 animate-pulse" /> : <Mic className="h-5 w-5" />}
          Live Lecture Capture
        </CardTitle>
        <CardDescription>
          {isRecording 
            ? "Recording and transcribing in real-time • Voice commands enabled" 
            : "Start recording your lecture with instant voice command support"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            className="flex-1"
          >
            {isRecording ? (
              <>
                <MicOff className="mr-2 h-4 w-4" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" />
                Start Recording
              </>
            )}
          </Button>
          <Button 
            onClick={() => handleGenerateQuestions(false)}
            disabled={!transcript || isProcessing || transcript.length < 50}
            variant="secondary"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Questions"
            )}
          </Button>
          {transcript && (
            <Button 
              onClick={clearTranscript}
              disabled={isProcessing}
              variant="outline"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>

        {isRecording && (
          <div className="space-y-2">
            <Badge variant="outline" className="w-full justify-center py-2">
              <Radio className="mr-2 h-3 w-3 text-red-500 animate-pulse" />
              Live
            </Badge>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-200 text-center">
                🎤 Voice Command Active: Say "generate question now"
              </p>
            </div>
          </div>
        )}

        {transcript && (
          <div className="border rounded-lg p-4 max-h-48 overflow-y-auto bg-muted/30">
            <p className="text-sm font-medium mb-2">Transcript:</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {transcript || "Waiting for audio..."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};