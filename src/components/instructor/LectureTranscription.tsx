import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Radio, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LectureTranscriptionProps {
  onQuestionGenerated: () => void;
}

// Constants for memory and resource management
const MAX_BUFFER_SIZE = 50000; // 50K characters max
const KEEP_RECENT_SIZE = 40000; // Keep 40K most recent
const RESTART_INTERVAL = 15 * 60 * 1000; // 15 minutes
const TOKEN_REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes
const MAX_RECORDING_CYCLES = 50; // Force restart after 50 cycles (~6.5 min)
const MAX_CONSECUTIVE_FAILURES = 3;

export const LectureTranscription = ({ onQuestionGenerated }: LectureTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [failureCount, setFailureCount] = useState(0);
  const [isCircuitOpen, setIsCircuitOpen] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const lastGeneratedIndexRef = useRef<number>(0);
  const triggerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);
  const isRecordingRef = useRef(false);
  const recordingCycleCountRef = useRef(0);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Real-time question detection - monitors transcript continuously
  useEffect(() => {
    if (!isRecording || transcriptChunks.length === 0) return;

    const lastChunk = transcriptChunks[transcriptChunks.length - 1];
    
    // Only check chunks that are substantial enough
    if (!lastChunk || lastChunk.length < 20) return;

    // Use 30-second sliding window for context
    const contextWindow = transcriptBufferRef.current.slice(-1500);

    checkForProfessorQuestion(lastChunk, contextWindow);
  }, [transcriptChunks, isRecording]);

  const checkForProfessorQuestion = async (chunk: string, context: string) => {
    try {
      console.log('🔍 Checking for question in chunk:', chunk.substring(0, 100));

      const { data, error } = await supabase.functions.invoke('detect-lecture-question', {
        body: { 
          recentChunk: chunk,
          context: context 
        }
      });

      if (error) {
        console.error('Question detection error:', error);
        return;
      }

      if (data?.is_question && data.confidence > 0.75) {
        console.log('✅ Question detected!', data.question_text);
        console.log('📊 Confidence:', data.confidence, 'Type:', data.suggested_type);
        
        // Auto-send question
        handleAutomaticQuestionSend(data);
      } else if (data?.is_question && data.confidence > 0.5) {
        console.log('⚠️ Low confidence question:', data.confidence, data.reasoning);
      }
    } catch (error) {
      console.error('Error in question detection:', error);
    }
  };

  const handleAutomaticQuestionSend = async (detectionData: any) => {
    try {
      toast({
        title: "🎯 Question detected!",
        description: `"${detectionData.question_text.substring(0, 60)}..." - Sending to students...`,
      });

      const fullContext = transcriptBufferRef.current.slice(-1000);

      const { data, error } = await supabase.functions.invoke('format-and-send-question', {
        body: {
          question_text: detectionData.question_text,
          suggested_type: detectionData.suggested_type,
          context: fullContext
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: "✅ Question sent!",
          description: `${data.question_type} question sent to ${data.sent_to} students`,
        });
        onQuestionGenerated();
      } else {
        throw new Error(data?.message || 'Failed to send question');
      }
    } catch (error: any) {
      console.error('Failed to send question:', error);
      toast({
        title: "Failed to send question",
        description: error.message || "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Periodic system restart for resource cleanup
  useEffect(() => {
    if (!isRecording) return;

    const restartTimer = setTimeout(() => {
      console.log("🔄 Performing periodic restart for resource cleanup");
      toast({
        title: "System refresh",
        description: "Refreshing audio system for optimal performance",
      });
      const wasRecording = isRecording;
      stopRecording();
      if (wasRecording) {
        setTimeout(() => startRecording(), 1000);
      }
    }, RESTART_INTERVAL);

    return () => clearTimeout(restartTimer);
  }, [isRecording]);

  // Token refresh for extended sessions
  useEffect(() => {
    if (!isRecording) return;

    const refreshTimer = setInterval(async () => {
      console.log("🔑 Refreshing auth token");
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error("Token refresh failed:", error);
        toast({
          title: "Session refresh issue",
          description: "Attempting to refresh authentication",
          variant: "destructive",
        });
      } else {
        console.log("✅ Token refreshed successfully");
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(refreshTimer);
  }, [isRecording]);

  // Recording duration timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }

    const startTime = Date.now();
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearTimeout(recordingIntervalRef.current);
      }
      if (triggerDebounceRef.current) {
        clearTimeout(triggerDebounceRef.current);
      }
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        streamRef.current = null;
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      // Check circuit breaker
      if (isCircuitOpen) {
        toast({
          title: "Please wait",
          description: "System is recovering from errors. Try again in a moment.",
          variant: "destructive",
        });
        return;
      }

      // Reset state for fresh recording session
      hasTriggeredRef.current = false;
      setTranscriptChunks([]);
      transcriptBufferRef.current = "";
      recordingCycleCountRef.current = 0;
      setFailureCount(0);
      setIsCircuitOpen(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);

      toast({
        title: "🎙️ Recording started",
        description: "AI will automatically detect when you ask questions to students",
      });

      // Start the continuous recording cycle
      startRecordingCycle();
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({ title: "Failed to start recording", variant: "destructive" });
    }
  };

  const startRecordingCycle = async () => {
    if (!streamRef.current) return;

    try {
      // Force restart after MAX_RECORDING_CYCLES for resource cleanup
      recordingCycleCountRef.current++;
      if (recordingCycleCountRef.current >= MAX_RECORDING_CYCLES) {
        console.log("🔄 Forcing cycle restart for resource cleanup");
        recordingCycleCountRef.current = 0;

        // Clean up current recorder
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current = null;
        }
      }

      // Try to use the best available audio format
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/ogg;codecs=opus";
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: 128000,
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
          console.log("📦 Complete audio blob:", audioBlob.size, "bytes, type:", audioBlob.type);
          await processAudioChunk(audioBlob);
        }

        // Clean up chunks
        chunks.length = 0;

        // Continue recording cycle if still active (use ref to avoid stale closure)
        if (isRecordingRef.current && streamRef.current) {
          console.log("♻️ Continuing recording cycle...");
          // Small delay before next cycle
          setTimeout(() => {
            if (isRecordingRef.current && streamRef.current) {
              startRecordingCycle();
            }
          }, 100);
        } else {
          console.log("🛑 Recording cycle stopped");
        }
      };

      // Record for 6 seconds (reduced from 8 for more frequent cleanup)
      mediaRecorder.start();
      console.log("🎙️ Started recording cycle", recordingCycleCountRef.current, "with format:", mimeType);

      // Stop after 6 seconds to create a complete audio file
      recordingIntervalRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 6000);
    } catch (error) {
      console.error("Error in recording cycle:", error);
      setFailureCount((prev) => prev + 1);

      if (failureCount >= MAX_CONSECUTIVE_FAILURES - 1) {
        setIsCircuitOpen(true);
        stopRecording();
        toast({
          title: "Recording paused",
          description: "Multiple errors detected. Please restart recording.",
          variant: "destructive",
        });

        // Auto-recover after 2 minutes
        setTimeout(
          () => {
            setIsCircuitOpen(false);
            setFailureCount(0);
          },
          2 * 60 * 1000,
        );
      } else if (isRecording) {
        // Try to restart the cycle with exponential backoff
        const backoffDelay = Math.min(1000 * Math.pow(2, failureCount), 5000);
        setTimeout(() => {
          if (isRecording && streamRef.current) {
            startRecordingCycle();
          }
        }, backoffDelay);
      }
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    recordingCycleCountRef.current = 0;

    // Clear interval
    if (recordingIntervalRef.current) {
      clearTimeout(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Stop current recorder with cleanup
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current = null;
    }

    // Stop stream with proper cleanup
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }

    toast({ title: "Recording stopped" });
  };

  const processAudioChunk = async (audioBlob: Blob) => {
    try {
      // Validate audio blob - require minimum size
      if (!audioBlob || audioBlob.size < 1000) {
        console.warn("Audio chunk too small, skipping:", audioBlob.size);
        return;
      }

      console.log("Processing audio chunk:", audioBlob.size, "bytes, type:", audioBlob.type);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(",")[1];
        if (!base64Audio) {
          console.error("Failed to convert audio to base64");
          return;
        }

        try {
          const { data, error } = await supabase.functions.invoke("transcribe-lecture", {
            body: { audio: base64Audio },
          });

          if (error) {
            console.error("Transcription error:", error);
            // Only show toast for critical errors, not for empty responses
            if (error.message && !error.message.includes("too small")) {
              toast({
                title: "Transcription error",
                description: "Please ensure your microphone is working properly.",
                variant: "destructive",
              });
            }
            return;
          }

          if (data?.text && data.text.trim()) {
            const newText = data.text.trim();
            console.log("✅ Transcribed chunk:", newText.substring(0, 100));
            console.log("📊 Current chunks count before adding:", transcriptChunks.length);

            // Reset failure count on success
            setFailureCount(0);

            // Add new chunk to array for display
            setTranscriptChunks((prev) => {
              const updated = [...prev, newText];
              console.log("📊 Chunks count after adding:", updated.length);
              return updated;
            });

            // Accumulate full transcript with buffer size management
            if (transcriptBufferRef.current) {
              transcriptBufferRef.current += " " + newText;
            } else {
              transcriptBufferRef.current = newText;
            }

            // Implement sliding window for memory management
            if (transcriptBufferRef.current.length > MAX_BUFFER_SIZE) {
              const trimmed = transcriptBufferRef.current.slice(-KEEP_RECENT_SIZE);
              transcriptBufferRef.current = trimmed;
              console.log("🧹 Trimmed transcript buffer to prevent memory issues");
            }

            console.log("📝 Total transcript length:", transcriptBufferRef.current.length);
          } else {
            console.log("ℹ️ No transcription result (audio may be silence)");
          }
        } catch (invokeError: any) {
          console.error("Function invoke error:", invokeError);

          // Handle auth errors with retry
          if (invokeError?.message?.includes("401") || invokeError?.status === 401) {
            console.log("🔑 Auth error, attempting token refresh");
            const { error } = await supabase.auth.refreshSession();
            if (!error) {
              // Retry the request once
              const { data: retryData, error: retryError } = await supabase.functions.invoke("transcribe-lecture", {
                body: { audio: base64Audio },
              });

              if (!retryError && retryData?.text?.trim()) {
                const newText = retryData.text.trim();
                setTranscriptChunks((prev) => [...prev, newText]);
                transcriptBufferRef.current += " " + newText;
                setFailureCount(0);
                return;
              }
            }
          }

          // Track failures
          setFailureCount((prev) => prev + 1);
        }
      };

      reader.onerror = () => {
        console.error("FileReader error:", reader.error);
      };
    } catch (error) {
      console.error("Transcription processing error:", error);
    }
  };

  const handleGenerateQuestions = async (isVoiceCommand = false) => {
    // For voice commands, be very lenient; for manual, require more content
    const minLength = isVoiceCommand ? 15 : 50;
    const fullTranscript = transcriptBufferRef.current;

    console.log(
      "📊 Generation check - length:",
      fullTranscript.length,
      "min required:",
      minLength,
      "voice command:",
      isVoiceCommand,
    );

    if (!fullTranscript.trim() || fullTranscript.length < minLength) {
      toast({
        title: "Not enough content",
        description: `Need at least ${minLength} characters. Current: ${fullTranscript.length}`,
      });
      return;
    }

    setIsProcessing(true);

    // Show instant feedback
    if (!isVoiceCommand) {
      toast({
        title: "⚡ Generating questions...",
        description: "Processing lecture content and course materials",
      });
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch uploaded lecture materials
      const { data: materials, error: materialsError } = await supabase
        .from("lecture_materials")
        .select("id, title, description, file_path, file_type")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5); // Get most recent 5 materials

      console.log("📚 Found", materials?.length || 0, "lecture materials");

      // Parse content from materials
      let materialContext: any[] = [];
      if (materials && materials.length > 0) {
        const parsePromises = materials.map(async (material) => {
          try {
            console.log("📖 Parsing material:", material.title);
            const { data, error } = await supabase.functions.invoke("parse-lecture-material", {
              body: { filePath: material.file_path },
            });

            if (error) {
              console.warn("Failed to parse material:", material.title, error);
              return null;
            }

            return {
              title: material.title,
              description: material.description,
              content: data.text,
            };
          } catch (error) {
            console.warn("Error parsing material:", material.title, error);
            return null;
          }
        });

        const parsedMaterials = await Promise.all(parsePromises);
        materialContext = parsedMaterials.filter((m) => m !== null);
        console.log("✅ Successfully parsed", materialContext.length, "materials");
      }

      // Use only the most recent 1200 chars (~1-2 minutes of speech)
      // This captures what professor JUST said with minimal tokens for cost efficiency
      const transcriptForGeneration = fullTranscript.slice(-600);

      console.log(
        "📊 Using most recent speech, length:",
        transcriptForGeneration.length,
        "of total:",
        fullTranscript.length,
      );

      console.log("📤 Sending to edge function:", {
        transcriptLength: transcriptForGeneration.length,
        materialsCount: materialContext.length,
        fullTranscriptLength: fullTranscript.length,
      });

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "generate-lecture-questions",
        {
          body: {
            transcript: transcriptForGeneration,
            materialContext: materialContext,
          },
        },
      );

      if (functionError) {
        console.error("Edge function error:", functionError);
        throw new Error(functionError.message || "Failed to call generation function");
      }

      if (!functionData || !functionData.questions) {
        console.error("Invalid response from edge function:", functionData);
        throw new Error("Invalid response format from AI");
      }

      console.log("✅ Received questions:", functionData.questions.length, "sets");

      // Save to review queue with full context snippet
      const { error: insertError } = await supabase.from("lecture_questions").insert([
        {
          instructor_id: user.id,
          transcript_snippet: fullTranscript.slice(-1000),
          questions: functionData.questions,
          status: "pending",
        },
      ]);

      if (insertError) {
        console.error("Database insert error:", insertError);
        throw new Error("Failed to save questions to database");
      }

      toast({
        title: "✅ Questions generated!",
        description:
          materialContext.length > 0
            ? `Using insights from ${materialContext.length} course materials`
            : "Check review queue to send to students",
      });

      onQuestionGenerated();
    } catch (error: any) {
      console.error("Question generation error:", error);
      toast({
        title: "Failed to generate questions",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearTranscript = () => {
    setTranscriptChunks([]);
    transcriptBufferRef.current = "";
    lastGeneratedIndexRef.current = 0;
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
            ? "Recording and transcribing in real-time • AI auto-detects questions • Sends directly to students"
            : "Start recording your lecture - AI will detect when you ask questions and send them automatically"}
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
          {transcriptChunks.length > 0 && (
            <Button onClick={clearTranscript} variant="outline" size="sm">
              Clear
            </Button>
          )}
        </div>

        {isRecording && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Badge variant="outline" className="flex-1 justify-center py-1.5">
                <Radio className="mr-2 h-3 w-3 text-red-500 animate-pulse" />
                Live
              </Badge>
              <Badge variant="secondary" className="flex-1 justify-center py-1.5">
                {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
              </Badge>
            </div>
            {failureCount > 0 && (
              <Badge variant="destructive" className="w-full justify-center py-1.5">
                <AlertCircle className="mr-2 h-3 w-3" />
                {failureCount} transcription {failureCount === 1 ? "failure" : "failures"}
              </Badge>
            )}
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
              <p className="text-xs font-medium text-green-900 dark:text-green-200 text-center">
                🤖 Auto-Detection Active: Questions sent instantly to students
              </p>
            </div>
          </div>
        )}

        {transcriptChunks.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <p className="text-sm font-medium">Transcript Chunks:</p>
            {transcriptChunks.map((chunk, index) => (
              <div key={index} className="border rounded-lg p-2.5 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">Chunk {index + 1}</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{chunk}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
