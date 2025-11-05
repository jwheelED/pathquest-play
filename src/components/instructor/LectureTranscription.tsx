import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Radio, Loader2, AlertCircle, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface LectureTranscriptionProps {
  onQuestionGenerated: () => void;
}

// Constants for memory and resource management
const MAX_BUFFER_SIZE = 50000; // 50K characters max
const KEEP_RECENT_SIZE = 40000; // Keep 40K most recent
const RESTART_INTERVAL = 15 * 60 * 1000; // 15 minutes
const TOKEN_REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes
const MAX_RECORDING_CYCLES = 50; // Force restart after 50 cycles (~8.5 min)
const MAX_CONSECUTIVE_FAILURES = 3;
const RECORDING_CHUNK_DURATION = 8000; // 8 seconds for better sentence completion
const MIN_CHUNK_LENGTH = 30; // Minimum characters to analyze

export const LectureTranscription = ({ onQuestionGenerated }: LectureTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [failureCount, setFailureCount] = useState(0);
  const [isCircuitOpen, setIsCircuitOpen] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceCommandDetected, setVoiceCommandDetected] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(true);
  const [lastTranscript, setLastTranscript] = useState<string>("");
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
  const lastDetectionTimeRef = useRef<number>(0);
  const lastDetectedChunkIndexRef = useRef<number>(-1);
  const { toast } = useToast();

  // Client-side cooldown: 5 seconds minimum between detection attempts
  const MIN_DETECTION_INTERVAL = 5000; // 5 seconds cooldown

  // Levenshtein distance for fuzzy matching
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    const maxLen = Math.max(s1.length, s2.length);
    return maxLen === 0 ? 1 : 1 - costs[s2.length] / maxLen;
  };

  // Real-time voice command detection - monitors transcript with sliding window
  useEffect(() => {
    if (!isRecording || transcriptChunks.length === 0) return;

    const currentChunkIndex = transcriptChunks.length - 1;
    
    // Prevent re-checking the same chunks we already processed
    if (currentChunkIndex <= lastDetectedChunkIndexRef.current) {
      return;
    }

    // Sliding window: Check last 3 chunks combined to catch commands split across boundaries
    const windowSize = Math.min(3, transcriptChunks.length);
    const recentChunks = transcriptChunks.slice(-windowSize);
    const slidingWindow = recentChunks.join(" ");
    
    // Update visual feedback with the most recent chunk
    setLastTranscript(transcriptChunks[transcriptChunks.length - 1]);
    
    // Only check if we have substantial content
    if (slidingWindow.length < MIN_CHUNK_LENGTH) return;

    // Check for voice commands in the sliding window
    checkForVoiceCommand(slidingWindow, currentChunkIndex);
  }, [transcriptChunks, isRecording]);

  const checkForVoiceCommand = (text: string, currentChunkIndex: number): boolean => {
    // Cooldown check - prevent duplicate triggers
    const now = Date.now();
    if (now - lastDetectionTimeRef.current < MIN_DETECTION_INTERVAL) {
      console.log('⏱️ Cooldown active, skipping detection');
      return false;
    }

    // Method 1: Expanded regex patterns - more flexible matching
    const commandPatterns = [
      // Core patterns with optional words
      /send\s+(the\s+|a\s+|this\s+|that\s+)?question(\s+now)?(\s+please)?[!.]?/i,
      /send\s+it(\s+now)?(\s+please)?[!.]?/i,
      /send\s+out\s+(the\s+)?question[!.]?/i,
      
      // Alternative verbs
      /push\s+(the\s+|this\s+)?question[!.]?/i,
      /submit\s+(the\s+|this\s+)?question[!.]?/i,
      /ask\s+(the\s+)?question(\s+now)?[!.]?/i,
      
      // Direct commands
      /question\s+now[!.]?/i,
      /post\s+(the\s+)?question[!.]?/i,
    ];

    const hasRegexMatch = commandPatterns.some(pattern => pattern.test(text));

    // Method 2: Keyword-based detection (just needs "send" + "question")
    const lowerText = text.toLowerCase();
    const hasKeywords = (lowerText.includes('send') || lowerText.includes('submit') || lowerText.includes('push')) && 
                        lowerText.includes('question');

    // Method 3: Fuzzy matching for common command phrases
    const targetPhrases = [
      "send question now",
      "send the question",
      "send question",
      "question now",
      "submit question"
    ];
    
    // Extract last ~30 characters for fuzzy matching to focus on recent speech
    const recentText = text.slice(-100).toLowerCase();
    const hasFuzzyMatch = targetPhrases.some(phrase => {
      // Check if phrase appears in text with high similarity
      const words = recentText.split(/\s+/);
      for (let i = 0; i <= words.length - phrase.split(' ').length; i++) {
        const segment = words.slice(i, i + phrase.split(' ').length).join(' ');
        const similarity = calculateSimilarity(segment, phrase);
        if (similarity >= 0.75) { // 75% similarity threshold
          console.log(`🎯 Fuzzy match: "${segment}" ≈ "${phrase}" (${Math.round(similarity * 100)}%)`);
          return true;
        }
      }
      return false;
    });

    // Trigger if ANY method detects the command
    const isDetected = hasRegexMatch || hasKeywords || hasFuzzyMatch;

    if (isDetected) {
      console.log('🎤 VOICE COMMAND DETECTED:', {
        text: text.slice(-100),
        regexMatch: hasRegexMatch,
        keywordMatch: hasKeywords,
        fuzzyMatch: hasFuzzyMatch,
        chunkIndex: currentChunkIndex
      });
      
      // Update cooldown timestamp AND mark this chunk as processed
      lastDetectionTimeRef.current = now;
      lastDetectedChunkIndexRef.current = currentChunkIndex;
      
      handleVoiceCommandQuestion();
      return true;
    }

    return false;
  };

  const handleVoiceCommandQuestion = async () => {
    try {
      // Trigger visual feedback immediately
      setVoiceCommandDetected(true);
      setTimeout(() => setVoiceCommandDetected(false), 2000);

      console.log('🎤 Voice command triggered! Processing...');

      toast({
        title: "🎤 Voice command detected!",
        description: "Extracting question from recent speech...",
        duration: 3000,
      });

      // Get last 45 seconds of transcript (before the voice command)
      // This gives enough context without including the command itself
      const recentTranscript = transcriptBufferRef.current.slice(-1500);

      console.log('📝 Extracting question from transcript:', recentTranscript.length, 'chars');

      const { data, error } = await supabase.functions.invoke('extract-voice-command-question', {
        body: { recentTranscript }
      });

      if (error) {
        console.error('Extract error:', error);
        throw error;
      }

      if (!data?.success || !data?.question_text) {
        toast({
          title: "❌ Could not extract question",
          description: "Try asking the question more clearly before using the voice command",
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Question extracted via voice command:', data.question_text);

      // Send immediately without confidence threshold
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0, // Voice command = maximum confidence
        extraction_method: 'voice_command'
      });

    } catch (error: any) {
      console.error('Voice command error:', error);
      toast({
        title: "❌ Voice command failed",
        description: error.message || "Could not process voice command. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleManualQuestionSend = async () => {
    try {
      if (!transcriptBufferRef.current || transcriptBufferRef.current.length < 50) {
        toast({
          title: "Not enough content",
          description: "Please record more lecture content before sending a question",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "🔍 Extracting question",
        description: "Analyzing recent speech...",
      });

      // Get last 45 seconds of transcript
      const recentTranscript = transcriptBufferRef.current.slice(-1500);

      console.log('📝 Manual send - extracting question from transcript:', recentTranscript.length, 'chars');

      const { data, error } = await supabase.functions.invoke('extract-voice-command-question', {
        body: { recentTranscript }
      });

      if (error) {
        throw error;
      }

      if (!data?.success || !data?.question_text) {
        toast({
          title: "Could not extract question",
          description: "Try asking a clearer question or use the voice command 'send question now'",
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Question extracted via manual send:', data.question_text);

      // Send immediately
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0,
        extraction_method: 'manual_button'
      });

    } catch (error: any) {
      console.error('Manual send error:', error);
      toast({
        title: "Failed to send question",
        description: error.message || "Could not process request",
        variant: "destructive",
      });
    }
  };

  const handleQuestionSend = async (detectionData: any) => {
    try {
      console.log('📤 Sending question to students:', detectionData);
      
      toast({
        title: "🎯 Question detected!",
        description: `"${detectionData.question_text.substring(0, 60)}..." - Sending to students...`,
      });

      // Provide richer context for better question formatting
      const fullContext = transcriptBufferRef.current.slice(-1500);

      const { data, error } = await supabase.functions.invoke('format-and-send-question', {
        body: {
          question_text: detectionData.question_text,
          suggested_type: detectionData.suggested_type,
          context: fullContext,
          confidence: detectionData.confidence
        }
      });

      console.log('📥 Edge function response:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      if (data?.success) {
        console.log('✅ Question successfully sent!');
        toast({
          title: "✅ Question sent!",
          description: `${data.question_type} question sent to ${data.sent_to} students`,
          duration: 5000,
        });
        onQuestionGenerated();
      } else {
        console.error('❌ Question send failed:', data);
        throw new Error(data?.message || 'Failed to send question');
      }
    } catch (error: any) {
      console.error('❌ Failed to send question:', error);
      toast({
        title: "❌ Failed to send question",
        description: error.message || "Unknown error occurred. Please try again.",
        variant: "destructive",
        duration: 5000,
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
      lastDetectionTimeRef.current = 0;
      lastDetectedChunkIndexRef.current = -1;

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

      // Record for 8 seconds for better sentence completion and context
      mediaRecorder.start();
      console.log("🎙️ Started recording cycle", recordingCycleCountRef.current, "with format:", mimeType);

      // Stop after 8 seconds to capture complete thoughts/sentences
      recordingIntervalRef.current = setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          console.log("⏹️ Stopping recording cycle after", RECORDING_CHUNK_DURATION, "ms");
          mediaRecorder.stop();
        }
      }, RECORDING_CHUNK_DURATION);
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
            const wordCount = newText.split(/\s+/).length;
            console.log("✅ Transcribed:", wordCount, "words -", newText.substring(0, 120));
            console.log("📊 Total chunks:", transcriptChunks.length + 1);

            // Reset failure count on success
            setFailureCount(0);

            // Add new chunk to array for display
            setTranscriptChunks((prev) => {
              const updated = [...prev, newText];
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

            console.log("📝 Buffer: ~" + Math.round(transcriptBufferRef.current.length / 100) + "00 chars total");
          } else {
            console.log("ℹ️ No speech detected in this chunk (silence or background noise)");
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
    lastDetectionTimeRef.current = 0;
    lastDetectedChunkIndexRef.current = -1;
    toast({ title: "Transcript cleared" });
  };

  return (
    <>
      {/* Tutorial Section */}
      <Collapsible open={isTutorialOpen} onOpenChange={setIsTutorialOpen}>
        <Card className="mb-4 bg-muted/50 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                How to Use Live Lecture Capture
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isTutorialOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="sr-only">Toggle tutorial</span>
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <Badge variant="outline" className="shrink-0">Step 1</Badge>
                  <p>Click "Start Recording" to begin capturing your lecture audio in real-time.</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="shrink-0">Step 2</Badge>
                  <p>Ask your question naturally during the lecture.</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="shrink-0">Step 3</Badge>
                  <p>Either click the <strong>"Send Question"</strong> button below, or say <strong>"send question now"</strong> to instantly send it to students.</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="shrink-0">Step 4</Badge>
                  <p>The system will extract the most recent question from your speech and send it to all students.</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="relative overflow-hidden">
        {/* Voice Command Flash Overlay */}
        {voiceCommandDetected && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            <div className="absolute inset-0 bg-primary/20 animate-[fade-out_0.5s_ease-out]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-primary text-primary-foreground rounded-full p-6 shadow-2xl animate-[scale-in_0.3s_ease-out]">
                <Zap className="h-12 w-12 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            {isRecording ? <Radio className="h-4 w-4 text-red-500 animate-pulse" /> : <Mic className="h-4 w-4" />}
            Live Lecture Capture
          </CardTitle>
          <CardDescription className="text-sm">
            {isRecording
              ? "🎙️ Recording • Click 'Send Question' button or say 'send question now' to send your most recent question to students"
              : "Start recording - use the 'Send Question' button or say 'send question now' to send questions to students"}
          </CardDescription>
        </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
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
          
          {isRecording && transcriptChunks.length > 0 && (
            <Button 
              onClick={handleManualQuestionSend} 
              variant="default"
              className="w-full"
            >
              <Zap className="mr-2 h-4 w-4" />
              Send Question
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
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 space-y-1">
              <p className="text-xs font-medium text-center">
                💡 Click "Send Question" button or say "send question now"
              </p>
            </div>
            
            {lastTranscript && (
              <div className="bg-muted border border-border rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Radio className="h-3 w-3" />
                  Last Transcribed:
                </p>
                <p className="text-sm text-foreground">{lastTranscript}</p>
              </div>
            )}
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
    </>
  );
};
