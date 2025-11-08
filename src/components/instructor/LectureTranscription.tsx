import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Radio, Loader2, AlertCircle, Zap, ChevronDown, ChevronUp, Clock, Sparkles } from "lucide-react";
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
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [nextQuestionAllowedAt, setNextQuestionAllowedAt] = useState<number>(0);
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState<number>(0);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [systemHealthy, setSystemHealthy] = useState<boolean>(true);
  const [dailyQuestionCount, setDailyQuestionCount] = useState<number>(0);
  const [dailyQuotaLimit, setDailyQuotaLimit] = useState<number>(200);
  const [autoQuestionEnabled, setAutoQuestionEnabled] = useState(false);
  const [autoQuestionInterval, setAutoQuestionInterval] = useState<number>(15);
  const [lastAutoQuestionTime, setLastAutoQuestionTime] = useState<number>(0);
  const [nextAutoQuestionIn, setNextAutoQuestionIn] = useState<number>(0);
  const [autoQuestionCount, setAutoQuestionCount] = useState<number>(0);
  const [intervalTranscriptLength, setIntervalTranscriptLength] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const intervalTranscriptRef = useRef<string>("");
  const lastGeneratedIndexRef = useRef<number>(0);
  const triggerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);
  const isRecordingRef = useRef(false);
  const recordingCycleCountRef = useRef(0);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const lastDetectedChunkIndexRef = useRef<number>(-1);
  const lastQuestionSentTimeRef = useRef<number>(0);
  const isGeneratingAutoQuestionRef = useRef<boolean>(false);
  const { toast } = useToast();

  // Client-side cooldown: 10 seconds minimum between detection attempts
  const MIN_DETECTION_INTERVAL = 10000; // 10 seconds cooldown
  const SUPPRESS_ERRORS_AFTER_SEND = 8000; // 8 seconds after question sent

  // Fetch student count, daily quota, custom limit, and auto-question settings on mount
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch student count
        const { data: students, error } = await supabase
          .from('instructor_students')
          .select('student_id')
          .eq('instructor_id', user.id);

        if (!error && students) {
          setStudentCount(students.length);
        }

        // Fetch instructor's custom daily limit and auto-question settings
        const { data: profile } = await supabase
          .from('profiles')
          .select('daily_question_limit, auto_question_enabled, auto_question_interval')
          .eq('id', user.id)
          .single();

        if (profile?.daily_question_limit) {
          setDailyQuotaLimit(profile.daily_question_limit);
        }
        
        if (profile) {
          setAutoQuestionEnabled(profile.auto_question_enabled || false);
          setAutoQuestionInterval(profile.auto_question_interval || 15);
        }

        // Fetch today's question count
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
          .from('student_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('instructor_id', user.id)
          .eq('assignment_type', 'lecture_checkin')
          .gte('created_at', today);

        if (count !== null) {
          setDailyQuestionCount(count);
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    
    // Refresh counts every 30 seconds when recording
    const interval = setInterval(() => {
      if (isRecording) {
        fetchCounts();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Monitor system health
  useEffect(() => {
    const healthy = failureCount < MAX_CONSECUTIVE_FAILURES && !isCircuitOpen;
    setSystemHealthy(healthy);
  }, [failureCount, isCircuitOpen]);

  // Countdown timer for rate limit
  useEffect(() => {
    if (nextQuestionAllowedAt > Date.now()) {
      const interval = setInterval(() => {
        const secondsLeft = Math.ceil((nextQuestionAllowedAt - Date.now()) / 1000);
        if (secondsLeft > 0) {
          setRateLimitSecondsLeft(secondsLeft);
        } else {
          setRateLimitSecondsLeft(0);
          setNextQuestionAllowedAt(0);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setRateLimitSecondsLeft(0);
    }
  }, [nextQuestionAllowedAt]);

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
    // Prevent detection while already sending a question
    if (isSendingQuestion) {
      console.log('🚫 Already sending a question, skipping detection');
      return false;
    }

    // Check if we're in a rate limit window
    const now = Date.now();
    if (now < nextQuestionAllowedAt) {
      console.log('⏱️ Rate limit active, skipping detection');
      return false;
    }

    // Cooldown check - prevent duplicate triggers
    if (now - lastDetectionTimeRef.current < MIN_DETECTION_INTERVAL) {
      console.log('⏱️ Cooldown active, skipping detection');
      return false;
    }

    // CONTEXT WINDOW VALIDATION: Only check last 100 characters for commands
    // Commands should be at the END of speech, not buried in middle
    const contextWindow = text.slice(-100);
    
    // PRE-VALIDATION: Check if there's actually a question before triggering
    const hasQuestionMark = text.includes('?');
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose', 'whom', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does'];
    const lowerText = text.toLowerCase();
    const hasQuestionWords = questionWords.some(word => {
      // Check for word boundaries to avoid false matches
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(lowerText);
    });
    
    // Method 1: Tightened regex patterns - require "question" + send verb close together
    const commandPatterns = [
      // Core patterns with optional words
      /send\s+(the\s+|a\s+|this\s+|that\s+)?question(\s+now)?(\s+please)?[!.]?/i,
      /send\s+it(\s+now)?(\s+please)?[!.]?/i,
      /send\s+out\s+(the\s+)?question[!.]?/i,
      
      // Alternative verbs
      /push\s+(the\s+|this\s+)?question[!.]?/i,
      /submit\s+(the\s+|this\s+)?question[!.]?/i,
      // REMOVED: /ask\s+(the\s+)?question(\s+now)?[!.]?/i - too broad
      
      // Direct commands
      /question\s+now[!.]?/i,
      /post\s+(the\s+)?question[!.]?/i,
    ];

    const hasRegexMatch = commandPatterns.some(pattern => pattern.test(contextWindow));

    // Method 2: Keyword-based detection (just needs "send" + "question")
    const lowerContext = contextWindow.toLowerCase();
    const hasKeywords = (lowerContext.includes('send') || lowerContext.includes('submit') || lowerContext.includes('push')) && 
                        lowerContext.includes('question');

    // Method 3: Fuzzy matching for common command phrases with INCREASED threshold
    const targetPhrases = [
      "send question now",
      "send the question",
      "send question",
      "question now",
      "submit question"
    ];
    
    const hasFuzzyMatch = targetPhrases.some(phrase => {
      // Check if phrase appears in context window with high similarity
      const words = lowerContext.split(/\s+/);
      for (let i = 0; i <= words.length - phrase.split(' ').length; i++) {
        const segment = words.slice(i, i + phrase.split(' ').length).join(' ');
        const similarity = calculateSimilarity(segment, phrase);
        if (similarity >= 0.85) { // INCREASED from 0.75 to 0.85 (85% similarity)
          console.log(`🎯 Fuzzy match: "${segment}" ≈ "${phrase}" (${Math.round(similarity * 100)}%)`);
          return true;
        }
      }
      return false;
    });

    // Trigger if ANY method detects the command AND there's evidence of a question
    const commandDetected = hasRegexMatch || hasKeywords || hasFuzzyMatch;
    const hasQuestionEvidence = hasQuestionMark || hasQuestionWords;
    
    // PRE-VALIDATION: Only proceed if we have both command and question evidence
    if (commandDetected && !hasQuestionEvidence) {
      console.log('⚠️ Command detected but no question evidence - likely false positive');
      return false;
    }
    
    const isDetected = commandDetected && hasQuestionEvidence;

    if (isDetected) {
      console.log('🎤 VOICE COMMAND DETECTED:', {
        contextWindow: contextWindow,
        hasQuestionMark,
        hasQuestionWords,
        regexMatch: hasRegexMatch,
        keywordMatch: hasKeywords,
        fuzzyMatch: hasFuzzyMatch,
        chunkIndex: currentChunkIndex
      });
      
      // CRITICAL: Set cooldown IMMEDIATELY to prevent re-detection
      lastDetectionTimeRef.current = now;
      lastDetectedChunkIndexRef.current = currentChunkIndex;
      
      // Clear the command phrase from buffer to prevent re-detection
      // Remove last ~25 characters (the "send question now" phrase)
      if (transcriptBufferRef.current.length > 25) {
        transcriptBufferRef.current = transcriptBufferRef.current.slice(0, -25);
        console.log('🧹 Cleared command phrase from buffer');
      }
      
      handleVoiceCommandQuestion();
      return true;
    }

    return false;
  };

  const handleVoiceCommandQuestion = async () => {
    // Prevent multiple simultaneous sends
    if (isSendingQuestion) {
      console.log('🚫 Already processing a question, ignoring duplicate trigger');
      return;
    }

    try {
      setIsSendingQuestion(true);
      
      // Trigger visual feedback immediately
      setVoiceCommandDetected(true);
      setTimeout(() => setVoiceCommandDetected(false), 2000);

      console.log('🎤 Voice command triggered! Processing...');

      toast({
        title: "🎤 Voice command detected!",
        description: "Extracting question from recent speech...",
        duration: 3000,
      });

      // Get last ~45-60 seconds of transcript (before the voice command)
      // Ensure we don't cut off mid-word
      let recentTranscript = transcriptBufferRef.current.slice(-2000); // Increased from 1500

      // Trim to nearest word boundary at the start to avoid partial words
      const firstSpaceIndex = recentTranscript.indexOf(' ');
      if (firstSpaceIndex > 0 && firstSpaceIndex < 100) {
        recentTranscript = recentTranscript.slice(firstSpaceIndex + 1);
      }

      console.log('📝 Extracting question from transcript:', recentTranscript.length, 'chars');

      const { data, error } = await supabase.functions.invoke('extract-voice-command-question', {
        body: { recentTranscript }
      });

      if (error) {
        console.error('Extract error:', error);
        throw error;
      }

      if (!data?.success || !data?.question_text) {
        // SUPPRESS ERROR: This is likely a false positive detection
        // Log it silently instead of showing error toast to user
        console.log('⚠️ No question found in transcript - likely false positive detection');
        console.log('Transcript analyzed:', recentTranscript.slice(-200));
        return;
      }

      console.log('✅ Question extracted via voice command:', data.question_text);

      // Send immediately without confidence threshold
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0, // Voice command = maximum confidence
        extraction_method: 'voice_command',
        source: 'voice_command'
      });
      
      // Reset auto-question timer after voice command
      if (autoQuestionEnabled) {
        setLastAutoQuestionTime(Date.now());
        intervalTranscriptRef.current = "";
        setIntervalTranscriptLength(0);
        console.log('🔄 Auto-question timer reset after voice command');
      }

    } catch (error: any) {
      console.error('Voice command error:', error);
      
      // Check if this is a rate limit error (don't show as "failed")
      if (error.message?.includes('wait') || error.message?.includes('seconds between')) {
        // Rate limit error is already handled by handleQuestionSend
        // Just log it, don't show duplicate error
        console.log('ℹ️ Rate limit applied, countdown shown to user');
      } else {
        // Show error only for actual failures (auth, network, etc.)
        toast({
          title: "❌ Voice command failed",
          description: error.message || "Could not process voice command. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      // Always clear the sending flag, even on error
      setIsSendingQuestion(false);
    }
  };

  const handleManualQuestionSend = async () => {
    // Prevent multiple simultaneous sends
    if (isSendingQuestion) {
      console.log('🚫 Already processing a question');
      return;
    }

    try {
      setIsSendingQuestion(true);

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
        extraction_method: 'manual_button',
        source: 'manual_button'
      });
      
      // Reset auto-question timer after manual send
      if (autoQuestionEnabled) {
        setLastAutoQuestionTime(Date.now());
        intervalTranscriptRef.current = "";
        setIntervalTranscriptLength(0);
        console.log('🔄 Auto-question timer reset after manual send');
      }

    } catch (error: any) {
      console.error('Manual send error:', error);
      toast({
        title: "Failed to send question",
        description: error.message || "Could not process request",
        variant: "destructive",
      });
    } finally {
      // Always clear the sending flag
      setIsSendingQuestion(false);
    }
  };

  // Pre-validation before sending question
  const validateBeforeSend = async (isAutoQuestion = false): Promise<{ valid: boolean; error?: string }> => {
    try {
      // Check rate limit (skip for auto-questions - they're on a timer)
      const now = Date.now();
      if (!isAutoQuestion && now < nextQuestionAllowedAt) {
        const secondsLeft = Math.ceil((nextQuestionAllowedAt - now) / 1000);
        return { 
          valid: false, 
          error: `⏱️ Please wait ${secondsLeft} seconds before sending another question` 
        };
      }

      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { 
          valid: false, 
          error: "🔐 Session expired - please refresh the page" 
        };
      }

      // Check if students are connected
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { 
          valid: false, 
          error: "🔐 Authentication required - please refresh the page" 
        };
      }

      const { data: students, error: studentsError } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', user.id);

      if (studentsError) {
        console.error('Error checking students:', studentsError);
        return { 
          valid: false, 
          error: "❌ Could not verify student connections" 
        };
      }

      if (!students || students.length === 0) {
        return { 
          valid: false, 
          error: "👥 No students connected - please share your instructor code with students" 
        };
      }

      // Check if there's enough transcript content (skip for auto-questions - already checked)
      if (!isAutoQuestion && (!transcriptBufferRef.current || transcriptBufferRef.current.length < 30)) {
        return { 
          valid: false, 
          error: "📝 Not enough lecture content - continue speaking for a few more seconds" 
        };
      }

      return { valid: true };
    } catch (error: any) {
      console.error('Validation error:', error);
      return { 
        valid: false, 
        error: "❌ Validation failed - please try again" 
      };
    }
  };

  // Retry logic with exponential backoff
  const retryWithBackoff = async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> => {
    let lastError: any;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on specific errors
        if (error.status === 429 || error.status === 400 || error.status === 401) {
          throw error;
        }
        
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  };

  const handleQuestionSend = async (detectionData: any) => {
    try {
      console.log('📤 Sending question to students:', detectionData);
      
      // Pre-validation (pass true for auto-questions to skip rate limit check)
      const validation = await validateBeforeSend(detectionData.source === 'auto_interval');
      if (!validation.valid) {
        console.error('❌ Pre-validation failed:', validation.error);
        console.error('❌ Source:', detectionData.source || 'unknown');
        console.error('❌ Question:', detectionData.question_text?.substring(0, 100));
        
        toast({
          title: "Cannot send question",
          description: validation.error,
          variant: "destructive",
          duration: 5000,
        });
        return;
      }

      // Refresh token before critical operation
      console.log('🔑 Refreshing auth token before send');
      await supabase.auth.refreshSession();
      
      toast({
        title: "🎯 Question detected!",
        description: `"${detectionData.question_text.substring(0, 60)}..." - Sending to students...`,
      });

      // Provide richer context for better question formatting
      const fullContext = transcriptBufferRef.current.slice(-1500);

      // Retry logic for transient failures
      const { data, error } = await retryWithBackoff(async () => {
        return await supabase.functions.invoke('format-and-send-question', {
          body: {
            question_text: detectionData.question_text,
            suggested_type: detectionData.suggested_type,
            context: fullContext,
            confidence: detectionData.confidence,
            source: detectionData.source || 'manual_button'
          }
        });
      });

      console.log('📥 Edge function response:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        
        // Handle 429 Rate Limit - distinguish between cooldown and daily limit
        if (error.message?.includes('429') || error.status === 429) {
          const errorData = data?.error || error.context || {};
          
          // Check if this is daily limit or cooldown
          if (errorData.error_type === 'daily_limit' || errorData.quota_reset) {
            const hoursLeft = errorData.hours_until_reset || 0;
            const minutesLeft = errorData.minutes_until_reset || 0;
            const currentCount = errorData.current_count || dailyQuestionCount;
            const limit = errorData.daily_limit || dailyQuotaLimit;
            
            toast({
              title: "🚫 Daily question limit reached",
              description: `You've sent ${currentCount}/${limit} questions today. Resets in ${hoursLeft}h ${minutesLeft}m at midnight UTC.`,
              variant: "destructive",
              duration: 10000,
            });
          } else {
            // Regular cooldown
            const retryAfter = errorData.retry_after || 60;
            const nextAllowed = Date.now() + (retryAfter * 1000);
            setNextQuestionAllowedAt(nextAllowed);
            
            toast({
              title: "✅ Question sent!",
              description: `Next question available in ${retryAfter}s (prevents accidental duplicates)`,
              duration: Math.min(retryAfter * 1000, 5000),
            });
          }
          
          // Don't throw - this is expected behavior, not an error
          return;
        }
        
        // Handle 401 authentication errors
        if (error.status === 401) {
          toast({
            title: "🔐 Session expired",
            description: "Please refresh the page to continue",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }
        
        // Handle 400 bad request
        if (error.status === 400) {
          toast({
            title: "❌ Invalid question",
            description: error.message || "The question format was invalid",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }
        
        // Handle 500 server errors
        if (error.status === 500) {
          toast({
            title: "❌ Server error",
            description: "There was a problem on the server. Please try again.",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }
        
        // Handle network errors
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          toast({
            title: "🌐 Network error",
            description: "Please check your internet connection and try again",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }
        
        // Generic error handling
        throw error;
      }

      if (data?.success) {
        console.log('✅ Question successfully sent!');
        
        // Update daily count
        setDailyQuestionCount(prev => prev + 1);
        
        toast({
          title: "✅ Question sent!",
          description: `${data.question_type} question sent to ${data.sent_to} students`,
          duration: 5000,
        });
        onQuestionGenerated();
        
        // After successful send, extend the cooldown and record send time
        lastDetectionTimeRef.current = Date.now();
        lastQuestionSentTimeRef.current = Date.now();
      } else {
        console.error('❌ Question send failed:', data);
        throw new Error(data?.message || 'Failed to send question');
      }
    } catch (error: any) {
      console.error('❌ Failed to send question:', error);
      
      // Don't show duplicate toasts if already handled above
      if (!error.status || (error.status !== 429 && error.status !== 400 && error.status !== 401 && error.status !== 500)) {
        // Check if it's a network error
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          // Already handled above
        } else {
          toast({
            title: "❌ Failed to send question",
            description: error.message || "An unexpected error occurred. Please try again.",
            variant: "destructive",
            duration: 5000,
          });
        }
      }
      throw error;
    }
  };

  // Core auto-question generation logic (extracted for reuse)
  const generateAndSendAutoQuestion = async (intervalTranscript: string, isManualTest = false) => {
    try {
      // Show pre-generation animation
      setVoiceCommandDetected(true);
      setTimeout(() => setVoiceCommandDetected(false), 2000);
      
      if (!isManualTest) {
        toast({
          title: "⏰ Auto-question triggered!",
          description: "Generating question from recent content...",
          duration: 3000,
        });
      }
      
      // Call edge function
      const { data, error } = await supabase.functions.invoke('generate-interval-question', {
        body: { 
          interval_transcript: intervalTranscript,
          interval_minutes: autoQuestionInterval
        }
      });
      
      if (error || !data?.success) {
        console.error('❌ Auto-question generation failed:', error);
        console.error('❌ Error data:', data);
        
        let errorMessage = "Could not generate question from recent content.";
        if (data?.error?.includes('Not enough content')) {
          errorMessage = `Need ${100 - intervalTranscript.length} more characters of lecture content.`;
        } else if (data?.error?.includes('confidence threshold')) {
          errorMessage = `AI confidence too low (${(data.confidence * 100)?.toFixed(0) || '?'}%). Keep teaching for better questions.`;
        } else if (data?.error) {
          errorMessage = data.error;
        }
        
        toast({
          title: isManualTest ? "🧪 Test Failed" : "⚠️ Auto-question skipped",
          description: errorMessage,
          variant: "destructive",
          duration: 5000,
        });
        
        return false;
      }
      
      console.log('✅ Auto-question generated:', data.question_text);
      console.log('📋 Confidence:', data.confidence);
      console.log('📝 Sending via handleQuestionSend...');
      
      // Send the question using existing flow
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: data.confidence,
        extraction_method: 'auto_interval',
        source: isManualTest ? 'manual_test' : 'auto_interval'
      });
      
      console.log('✅ Auto-question send completed');
      
      // Update state
      setAutoQuestionCount(prev => prev + 1);
      
      // Clear interval transcript buffer
      intervalTranscriptRef.current = "";
      setIntervalTranscriptLength(0);
      
      console.log(`✅ Auto-question sent! Total this session: ${autoQuestionCount + 1}`);
      
      if (isManualTest) {
        toast({
          title: "🧪 Test Successful!",
          description: `Question sent: "${data.question_text.substring(0, 50)}..."`,
          duration: 5000,
        });
      }
      
      return true;
      
    } catch (error) {
      console.error('Auto-question error:', error);
      toast({
        title: isManualTest ? "🧪 Test Error" : "❌ Auto-question error",
        description: "An error occurred while generating the auto-question",
        variant: "destructive",
        duration: 5000,
      });
      
      // Clear interval transcript buffer even on error
      intervalTranscriptRef.current = "";
      setIntervalTranscriptLength(0);
      return false;
    }
  };

  // Handle auto-question generation (called by timer)
  const handleAutoQuestionGeneration = async () => {
    try {
      console.log('⏰ Auto-question timer triggered');
      
      // Get transcript from current interval only
      const intervalTranscript = intervalTranscriptRef.current;
      
      if (intervalTranscript.length < 100) {
        console.log('⚠️ Not enough content in interval:', intervalTranscript.length, 'chars (need 100+)');
        toast({
          title: "⏭️ Auto-question skipped",
          description: `Need ${100 - intervalTranscript.length} more characters of lecture content`,
          duration: 3000,
        });
        return;
      }
      
      await generateAndSendAutoQuestion(intervalTranscript, false);
      
    } catch (error) {
      console.error('Auto-question error:', error);
    }
  };

  // Manual test function for debugging
  const handleTestAutoQuestion = async () => {
    const intervalTranscript = intervalTranscriptRef.current.trim();
    
    if (intervalTranscript.length < 100) {
      toast({
        title: "🧪 Cannot Test",
        description: `Need at least 100 characters. Current: ${intervalTranscript.length}`,
        variant: "destructive",
      });
      return;
    }

    if (isSendingQuestion) {
      toast({
        title: "⏳ Please Wait",
        description: "A question is already being processed",
      });
      return;
    }

    toast({
      title: "🧪 Testing Auto-Question",
      description: "Generating question from current interval content...",
    });

    await generateAndSendAutoQuestion(intervalTranscript, true);
  };

  // Periodic system restart for resource cleanup
  useEffect(() => {
    if (!isRecording) return;

    const restartTimer = setTimeout(() => {
      // Don't restart if auto-question is about to trigger (within 30 seconds)
      if (autoQuestionEnabled && lastAutoQuestionTime > 0) {
        const intervalMs = autoQuestionInterval * 60 * 1000;
        const timeToNextQuestion = intervalMs - (Date.now() - lastAutoQuestionTime);
        if (timeToNextQuestion < 30000 && timeToNextQuestion > 0) {
          console.log("⏰ Delaying restart - auto-question imminent in", Math.round(timeToNextQuestion / 1000), "s");
          return;
        }
      }
      
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

  // Auto-question timer logic
  useEffect(() => {
    if (!isRecording || !autoQuestionEnabled || isSendingQuestion) return;
    
    const intervalMs = autoQuestionInterval * 60 * 1000; // Convert minutes to ms
    
    // Initialize timer on first recording start
    if (lastAutoQuestionTime === 0) {
      setLastAutoQuestionTime(Date.now());
      setAutoQuestionCount(0);
      console.log(`⏰ Auto-questions initialized: every ${autoQuestionInterval} minutes`);
    }
    
    // Check if interval has elapsed
    const checkInterval = setInterval(() => {
      if (isSendingQuestion) return; // Don't trigger during send
      if (isGeneratingAutoQuestionRef.current) return; // Guard against concurrent calls
      if (isProcessing) return; // Don't trigger during audio processing
      
      const now = Date.now();
      const elapsed = now - lastAutoQuestionTime;
      const timeLeft = intervalMs - elapsed;
      const secondsLeft = Math.max(0, Math.ceil(timeLeft / 1000));
      
      setNextAutoQuestionIn(secondsLeft);
      
      // Trigger when interval is reached
      if (elapsed >= intervalMs) {
        // Set lock IMMEDIATELY before any async work
        isGeneratingAutoQuestionRef.current = true;
        
        // Update timer IMMEDIATELY to prevent re-trigger
        const newTime = Date.now();
        setLastAutoQuestionTime(newTime);
        
        // Call async function (won't be called again due to updated lastAutoQuestionTime)
        handleAutoQuestionGeneration().finally(() => {
          isGeneratingAutoQuestionRef.current = false;
        });
      }
    }, 1000);
    
    return () => clearInterval(checkInterval);
  }, [isRecording, autoQuestionEnabled, lastAutoQuestionTime, autoQuestionInterval, isSendingQuestion]);

  // Reset auto-question state when recording stops
  useEffect(() => {
    if (!isRecording) {
      setLastAutoQuestionTime(0);
      setNextAutoQuestionIn(0);
      setAutoQuestionCount(0);
      setIntervalTranscriptLength(0);
      intervalTranscriptRef.current = "";
      isGeneratingAutoQuestionRef.current = false;
    }
  }, [isRecording]);

  // Recording duration timer + Rate limit countdown
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }

    const startTime = Date.now();
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      
      // Update rate limit countdown
      const now = Date.now();
      if (now < nextQuestionAllowedAt) {
        setRateLimitSecondsLeft(Math.ceil((nextQuestionAllowedAt - now) / 1000));
      } else {
        setRateLimitSecondsLeft(0);
      }
    }, 1000);

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [isRecording, nextQuestionAllowedAt]);

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
            
            // Suppress errors shortly after sending a question (pending requests may fail)
            const timeSinceLastSend = Date.now() - lastQuestionSentTimeRef.current;
            const shouldSuppressError = timeSinceLastSend < SUPPRESS_ERRORS_AFTER_SEND;
            
            if (shouldSuppressError) {
              console.log('🔇 Suppressing transcription error (question just sent)');
              return;
            }
            
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
            
            // Also accumulate in interval transcript for auto-questions
            if (intervalTranscriptRef.current) {
              intervalTranscriptRef.current += " " + newText;
            } else {
              intervalTranscriptRef.current = newText;
            }
            
            // Update interval transcript length state for UI
            setIntervalTranscriptLength(intervalTranscriptRef.current.length);

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
                intervalTranscriptRef.current += " " + newText;
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
      {/* System Status Monitoring Dashboard */}
      {isRecording && (
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              📊 System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Transcription Status */}
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  {systemHealthy ? (
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                  <p className="text-xs font-medium text-muted-foreground">Transcription</p>
                </div>
                <p className="text-sm font-bold">
                  {systemHealthy ? '✅ Active' : '❌ Error'}
                </p>
              </div>

              {/* Question Detection Status */}
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="h-3 w-3 text-primary animate-pulse" />
                  <p className="text-xs font-medium text-muted-foreground">Detection</p>
                </div>
                <p className="text-sm font-bold">
                  {isSendingQuestion ? '🔄 Sending' : '👂 Listening'}
                </p>
              </div>

              {/* Students Connected */}
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Students</p>
                <p className="text-sm font-bold">
                  {studentCount === 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">👥 {studentCount}</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">✅ {studentCount}</span>
                  )}
                </p>
              </div>

              {/* Next Question Available */}
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Next Question</p>
                <p className="text-sm font-bold">
                  {rateLimitSecondsLeft > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">⏱️ {rateLimitSecondsLeft}s</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">✅ Ready</span>
                  )}
                </p>
              </div>

              {/* Daily Quota */}
              <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Daily Quota</p>
                <p className="text-sm font-bold">
                  {dailyQuestionCount >= dailyQuotaLimit ? (
                    <span className="text-red-600 dark:text-red-400">🚫 {dailyQuestionCount}/{dailyQuotaLimit}</span>
                  ) : dailyQuestionCount >= dailyQuotaLimit * 0.9 ? (
                    <span className="text-amber-600 dark:text-amber-400">⚠️ {dailyQuestionCount}/{dailyQuotaLimit}</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">📊 {dailyQuestionCount}/{dailyQuotaLimit}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Auto-Question Status */}
            {autoQuestionEnabled && (
              <div className="mt-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900 dark:text-blue-200">
                      Auto-Questions Active
                    </span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900">
                    Every {autoQuestionInterval} min
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-xs">Interval Content:</span>
                    <div className={`font-bold ${intervalTranscriptLength >= 100 ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}`}>
                      {intervalTranscriptLength}/100 chars
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-xs">Next In:</span>
                    <div className="font-bold text-blue-700 dark:text-blue-300">
                      {Math.floor(nextAutoQuestionIn / 60)}:{(nextAutoQuestionIn % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-xs">Sent This Session:</span>
                    <div className="font-bold text-blue-700 dark:text-blue-300">
                      {autoQuestionCount}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-xs">Status:</span>
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {intervalTranscriptLength >= 100 ? '✅ Ready' : '⏳ Building'}
                    </div>
                  </div>
                </div>
                
                {/* 10-second countdown animation */}
                {nextAutoQuestionIn <= 10 && nextAutoQuestionIn > 0 && (
                  <div className="animate-pulse bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-600 animate-bounce" />
                      <span className="font-bold text-yellow-900 dark:text-yellow-200">
                        Auto-question in {nextAutoQuestionIn}s...
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Manual Test Button */}
                <Button
                  onClick={handleTestAutoQuestion}
                  disabled={intervalTranscriptLength < 100 || isSendingQuestion || isGeneratingAutoQuestionRef.current}
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 bg-white dark:bg-gray-800"
                >
                  <Sparkles className="h-3 w-3 mr-2" />
                  {intervalTranscriptLength < 100 
                    ? `Test (Need ${100 - intervalTranscriptLength} more chars)` 
                    : 'Test Auto-Question Now'}
                </Button>
              </div>
            )}

            {/* Warning messages */}
            {studentCount === 0 && (
              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  ⚠️ No students connected. Share your instructor code with students to enable question sending.
                </p>
              </div>
            )}
            {!systemHealthy && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-900 dark:text-red-200">
                  ❌ System experiencing issues. Try stopping and restarting the recording.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              disabled={isSendingQuestion || rateLimitSecondsLeft > 0}
            >
              {isSendingQuestion ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : rateLimitSecondsLeft > 0 ? (
                <>
                  ⏱️ Wait {rateLimitSecondsLeft}s
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Send Question
                </>
              )}
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
            
            {/* Rate limit indicator */}
            {rateLimitSecondsLeft > 0 && (
              <Badge variant="default" className="w-full justify-center py-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                ⏱️ Rate limit: Next question in {rateLimitSecondsLeft}s
              </Badge>
            )}
            
            {failureCount > 0 && (
              <Badge variant="destructive" className="w-full justify-center py-1.5">
                <AlertCircle className="mr-2 h-3 w-3" />
                {failureCount} transcription {failureCount === 1 ? "failure" : "failures"}
              </Badge>
            )}
            
            {rateLimitSecondsLeft === 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 space-y-1">
                <p className="text-xs font-medium text-center">
                  ✅ Ready • Click "Send Question" or say "send question now"
                </p>
              </div>
            )}
            
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
