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
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const triggerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);
  const isRecordingRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    // Monitor transcript for voice command with multiple pattern matching
    const fullTranscript = transcriptBufferRef.current;
    const transcriptLower = fullTranscript.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Multiple trigger patterns for better detection
    const triggerPatterns = [
      'generate question now',
      'generate questions now',
      'generate a question now',
      'generate the question now',
      'create question now',
      'make question now'
    ];
    
    const matchedPattern = triggerPatterns.find(pattern => 
      transcriptLower.includes(pattern.replace(/[^\w\s]/g, ''))
    );
    
    if (isRecording && matchedPattern && !hasTriggeredRef.current) {
      console.log('🎯 Voice command detected:', matchedPattern);
      console.log('📝 Full transcript:', fullTranscript);
      hasTriggeredRef.current = true;
      
      // Clear any pending debounce
      if (triggerDebounceRef.current) {
        clearTimeout(triggerDebounceRef.current);
      }
      
      // Don't remove the trigger phrase - keep all lecture content
      // Just mark that we've triggered
      
      toast({
        title: "🎤 Voice command recognized!",
        description: "Generating questions from your lecture..."
      });
      
      // Trigger immediately with voice command flag
      handleGenerateQuestions(true);
      
      // Reset trigger flag after 3 seconds to allow another trigger
      triggerDebounceRef.current = setTimeout(() => {
        hasTriggeredRef.current = false;
        console.log('✅ Voice command ready again');
      }, 3000);
    }
  }, [transcriptChunks, isRecording]);

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
      setTranscriptChunks([]);
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
      isRecordingRef.current = true;
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
          console.log('📦 Complete audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
          await processAudioChunk(audioBlob);
        }

        // Continue recording cycle if still active (use ref to avoid stale closure)
        if (isRecordingRef.current && streamRef.current) {
          console.log('♻️ Continuing recording cycle...');
          // Small delay before next cycle
          setTimeout(() => {
            if (isRecordingRef.current && streamRef.current) {
              startRecordingCycle();
            }
          }, 100);
        } else {
          console.log('🛑 Recording cycle stopped');
        }
      };

      // Record for 8 seconds then stop to get a complete audio file
      mediaRecorder.start();
      console.log('🎙️ Started recording cycle with format:', mimeType);
      
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
    isRecordingRef.current = false;
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
            console.log('📊 Current chunks count before adding:', transcriptChunks.length);
            
            // Add new chunk to array for display
            setTranscriptChunks(prev => {
              const updated = [...prev, newText];
              console.log('📊 Chunks count after adding:', updated.length);
              return updated;
            });
            
            // Accumulate full transcript for question generation
            if (transcriptBufferRef.current) {
              transcriptBufferRef.current += " " + newText;
            } else {
              transcriptBufferRef.current = newText;
            }
            
            console.log('📝 Total transcript length:', transcriptBufferRef.current.length);
          } else {
            console.log('ℹ️ No transcription result (audio may be silence)');
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
    // For voice commands, be very lenient; for manual, require more content
    const minLength = isVoiceCommand ? 15 : 50;
    const fullTranscript = transcriptBufferRef.current;
    
    console.log('📊 Generation check - length:', fullTranscript.length, 'min required:', minLength, 'voice command:', isVoiceCommand);
    
    if (!fullTranscript.trim() || fullTranscript.length < minLength) {
      toast({ 
        title: "Not enough content", 
        description: `Need at least ${minLength} characters. Current: ${fullTranscript.length}`
      });
      return;
    }

    setIsProcessing(true);
    
    // Show instant feedback
    if (!isVoiceCommand) {
      toast({ 
        title: "⚡ Generating questions...", 
        description: "Processing lecture content and course materials"
      });
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch uploaded lecture materials
      const { data: materials, error: materialsError } = await supabase
        .from('lecture_materials')
        .select('id, title, description, file_path, file_type')
        .eq('instructor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5); // Get most recent 5 materials

      console.log('📚 Found', materials?.length || 0, 'lecture materials');

      // Parse content from materials
      let materialContext: any[] = [];
      if (materials && materials.length > 0) {
        const parsePromises = materials.map(async (material) => {
          try {
            console.log('📖 Parsing material:', material.title);
            const { data, error } = await supabase.functions.invoke('parse-lecture-material', {
              body: { filePath: material.file_path }
            });

            if (error) {
              console.warn('Failed to parse material:', material.title, error);
              return null;
            }

            return {
              title: material.title,
              description: material.description,
              content: data.text
            };
          } catch (error) {
            console.warn('Error parsing material:', material.title, error);
            return null;
          }
        });

        const parsedMaterials = await Promise.all(parsePromises);
        materialContext = parsedMaterials.filter(m => m !== null);
        console.log('✅ Successfully parsed', materialContext.length, 'materials');
      }

      // Use full accumulated transcript (up to 5000 chars for better context)
      const transcriptForGeneration = fullTranscript.slice(-5000);
      
      console.log('📤 Sending to edge function:', {
        transcriptLength: transcriptForGeneration.length,
        materialsCount: materialContext.length
      });

      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-lecture-questions', {
        body: { 
          transcript: transcriptForGeneration,
          materialContext: materialContext,
        }
      });

      if (functionError) {
        console.error('Edge function error:', functionError);
        throw new Error(functionError.message || 'Failed to call generation function');
      }

      if (!functionData || !functionData.questions) {
        console.error('Invalid response from edge function:', functionData);
        throw new Error('Invalid response format from AI');
      }

      console.log('✅ Received questions:', functionData.questions.length, 'sets');

      // Save to review queue with full context snippet
      const { error: insertError } = await supabase
        .from('lecture_questions')
        .insert([{
          instructor_id: user.id,
          transcript_snippet: fullTranscript.slice(-1000),
          questions: functionData.questions,
          status: 'pending'
        }]);

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw new Error('Failed to save questions to database');
      }

      toast({ 
        title: "✅ Questions generated!", 
        description: materialContext.length > 0 
          ? `Using insights from ${materialContext.length} course materials`
          : "Check review queue to send to students"
      });
      
      onQuestionGenerated();
    } catch (error: any) {
      console.error('Question generation error:', error);
      toast({ 
        title: "Failed to generate questions", 
        description: error.message || 'Unknown error occurred',
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearTranscript = () => {
    setTranscriptChunks([]);
    transcriptBufferRef.current = "";
    hasTriggeredRef.current = false;
    toast({ title: "Transcript cleared" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xl">
          {isRecording ? <Radio className="h-4 w-4 text-red-500 animate-pulse" /> : <Mic className="h-4 w-4" />}
          Live Lecture Capture
        </CardTitle>
        <CardDescription className="text-sm">
          {isRecording 
            ? "Recording and transcribing in real-time • Voice commands enabled • Using course materials for context" 
            : "Start recording your lecture - AI uses uploaded materials and transcription for questions"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
            disabled={transcriptChunks.length === 0 || isProcessing || transcriptBufferRef.current.length < 50}
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
          {transcriptChunks.length > 0 && (
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
            <Badge variant="outline" className="w-full justify-center py-1.5">
              <Radio className="mr-2 h-3 w-3 text-red-500 animate-pulse" />
              Live
            </Badge>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-200 text-center">
                🎤 Voice Command Active: Say "generate question now"
              </p>
            </div>
          </div>
        )}

        {transcriptChunks.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <p className="text-sm font-medium">Transcript Chunks:</p>
            {transcriptChunks.map((chunk, index) => (
              <div key={index} className="border rounded-lg p-2.5 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Chunk {index + 1}
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {chunk}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};