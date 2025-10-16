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
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearTimeout(recordingIntervalRef.current);
      }
      if (triggerDebounceRef.current) {
        clearTimeout(triggerDebounceRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Reset trigger flag and clear transcript for fresh recording session
      hasTriggeredRef.current = false;
      setTranscript("");
      transcriptBufferRef.current = "";
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } 
      });
      
      streamRef.current = stream;
      setIsRecording(true);
      
      toast({ 
        title: "🎙️ Recording started", 
        description: "Say 'generate question now' anytime to create questions instantly"
      });

      // Start the continuous recording cycle
      startRecordingCycle();
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({ title: "Failed to start recording", variant: "destructive" });
    }
  };

  const startRecordingCycle = async () => {
    if (!streamRef.current) return;

    try {
      // Try to use the best available audio format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg;codecs=opus';
      }
      
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Create complete audio blob from all chunks
        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: mimeType });
          console.log('Complete audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
          await processAudioChunk(audioBlob);
        }

        // Continue recording cycle if still active
        if (isRecording && streamRef.current) {
          // Small delay before next cycle
          setTimeout(() => {
            if (isRecording && streamRef.current) {
              startRecordingCycle();
            }
          }, 100);
        }
      };

      // Record for 8 seconds then stop to get a complete audio file
      mediaRecorder.start();
      console.log('Started recording cycle with format:', mimeType);
      
      // Stop after 8 seconds to create a complete audio file
      recordingIntervalRef.current = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 8000);
      
    } catch (error) {
      console.error('Error in recording cycle:', error);
      if (isRecording) {
        // Try to restart the cycle
        setTimeout(() => {
          if (isRecording && streamRef.current) {
            startRecordingCycle();
          }
        }, 1000);
      }
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    // Clear interval
    if (recordingIntervalRef.current) {
      clearTimeout(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Stop current recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    toast({ title: "Recording stopped" });
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
            const newText = data.text.trim();
            console.log('✅ Transcribed chunk:', newText.substring(0, 100));
            
            // Accumulate transcript with proper spacing
            if (transcriptBufferRef.current) {
              transcriptBufferRef.current += " " + newText;
            } else {
              transcriptBufferRef.current = newText;
            }
            
            // Update display
            setTranscript(transcriptBufferRef.current.trim());
            console.log('📝 Total transcript length:', transcriptBufferRef.current.length);
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