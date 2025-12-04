import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  MicOff,
  Radio,
  Loader2,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Star,
  Monitor,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuthRefresh } from "@/hooks/useAuthRefresh";
import { Progress } from "@/components/ui/progress";
import { analyzeContentQuality, isPauseDetected } from "@/lib/contentQuality";
import { type AutoQuestionMetrics, type SkipReason } from "./AutoQuestionDashboard";
import { ErrorHistoryPanel, type ErrorRecord } from "./ErrorHistoryPanel";
import { AutoQuestionDebugDashboard } from "./AutoQuestionDebugDashboard";
import { getOrgId } from "@/hooks/useOrgId";
import { playNotificationSound } from "@/lib/audioNotification";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePresenterBroadcast } from "@/hooks/useLecturePresenterChannel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LectureTranscriptionProps {
  onQuestionGenerated: () => void;
}

// Constants for memory and resource management
const MAX_BUFFER_SIZE = 50000; // 50K characters max
const KEEP_RECENT_SIZE = 40000; // Keep 40K most recent
const RESTART_INTERVAL = 15 * 60 * 1000; // 15 minutes
const TOKEN_REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes
const MAX_RECORDING_CYCLES = 50; // Force restart after 50 cycles (~8.5 min)
const MAX_CONSECUTIVE_FAILURES = 5; // Increased from 3 to 5
const RECORDING_CHUNK_DURATION = 8000; // 8 seconds for better sentence completion
const MIN_CHUNK_LENGTH = 30; // Minimum characters to analyze
const CIRCUIT_BREAKER_BACKOFF = [30000, 60000, 120000, 300000]; // 30s, 60s, 120s, 300s
// Quota-specific circuit breaker
const QUOTA_CIRCUIT_BREAKER_THRESHOLD = 3; // Trigger after 3 consecutive quota errors
const QUOTA_PAUSE_DURATION = 5 * 60 * 1000; // 5 minutes pause

export const LectureTranscription = ({ onQuestionGenerated }: LectureTranscriptionProps) => {
  // Helper function to safely extract displayable text from question_text (string or object)
  const getQuestionPreview = (questionText: any, maxLength: number = 60): string => {
    if (typeof questionText === "string") {
      return questionText.substring(0, maxLength);
    }
    // For coding questions (object format)
    if (questionText?.title) {
      return `[Coding] ${questionText.title}`;
    }
    if (questionText?.problemStatement) {
      return questionText.problemStatement.substring(0, maxLength);
    }
    return "Question";
  };

  // Proactive token refresh
  useAuthRefresh(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [failureCount, setFailureCount] = useState(0);
  const [isCircuitOpen, setIsCircuitOpen] = useState(false);
  const [circuitBreakerRetryAt, setCircuitBreakerRetryAt] = useState<number>(0);
  const [circuitBreakerCountdown, setCircuitBreakerCountdown] = useState<number>(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceCommandDetected, setVoiceCommandDetected] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [nextQuestionAllowedAt, setNextQuestionAllowedAt] = useState<number>(0);
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState<number>(0);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [systemHealthy, setSystemHealthy] = useState<boolean>(true);
  const [dailyQuestionCount, setDailyQuestionCount] = useState<number>(0);
  const [transcriptionRating, setTranscriptionRating] = useState<string | null>(null);
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [dailyQuotaLimit, setDailyQuotaLimit] = useState<number>(200);
  const [autoQuestionEnabled, setAutoQuestionEnabled] = useState(false);
  const [autoQuestionInterval, setAutoQuestionInterval] = useState<number>(15);
  const [autoQuestionForceSend, setAutoQuestionForceSend] = useState(false);
  const [lastAutoQuestionTime, setLastAutoQuestionTime] = useState<number>(0);
  const [nextAutoQuestionIn, setNextAutoQuestionIn] = useState<number>(0);
  const [autoQuestionCount, setAutoQuestionCount] = useState<number>(0);
  const [intervalTranscriptLength, setIntervalTranscriptLength] = useState<number>(0);
  const [contentQualityScore, setContentQualityScore] = useState<number>(0);
  const [batchProgress, setBatchProgress] = useState<string>("");
  const [autoQuestionMetrics, setAutoQuestionMetrics] = useState<AutoQuestionMetrics>({
    questionsSent: 0,
    questionsSkipped: 0,
    averageQuality: 0,
    skipReasons: [],
    fallbacksUsed: 0,
    intervalsCompleted: 0,
    retryQueueSize: 0,
  });
  const [strictModeEnabled, setStrictModeEnabled] = useState(true);
  const [retryQueue, setRetryQueue] = useState<string[]>([]);
  const [quotaErrorActive, setQuotaErrorActive] = useState(false);
  const [quotaConsecutiveErrors, setQuotaConsecutiveErrors] = useState(0);
  const [quotaCircuitBreakerRetryAt, setQuotaCircuitBreakerRetryAt] = useState<number>(0);
  const [quotaCircuitBreakerCountdown, setQuotaCircuitBreakerCountdown] = useState<number>(0);

  // Error history tracking
  const [errorHistory, setErrorHistory] = useState<ErrorRecord[]>([]);

  // Extraction error dialog
  const [showExtractionDialog, setShowExtractionDialog] = useState(false);
  const [partialQuestion, setPartialQuestion] = useState("");
  const [editedQuestion, setEditedQuestion] = useState("");

  // Debug dashboard state
  const [lastAutoQuestionError, setLastAutoQuestionError] = useState<string | null>(null);
  const [lastAutoQuestionErrorTime, setLastAutoQuestionErrorTime] = useState<Date | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(0);

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
  const intervalStartTimeRef = useRef<number>(0);
  const { toast } = useToast();

  // Presenter broadcast channel (for popup presenter view)
  const { broadcast } = usePresenterBroadcast();

  // Supabase Realtime channel for broadcasting timer to students
  const studentTimerChannelRef = useRef<any>(null);

  // Client-side cooldown: 5 seconds minimum between detection attempts
  const MIN_DETECTION_INTERVAL = 5000; // 5 seconds cooldown
  const SUPPRESS_ERRORS_AFTER_SEND = 8000; // 8 seconds after question sent

  // PHASE 2: Pre-warm AI connections during recording to reduce latency
  useEffect(() => {
    if (!isRecording) return;

    console.log("🔥 Pre-warming AI connections via health checks...");

    // Send lightweight health check every 2 minutes to keep edge function warm
    const keepaliveInterval = setInterval(async () => {
      try {
        console.log("⏱️ Sending keepalive health check...");
        // Call a lightweight edge function to keep connections warm
        await supabase.functions.invoke("health-check").catch(() => {
          console.log("⚠️ Keepalive failed (connection is warm)");
        });
      } catch (error) {
        console.log("⚠️ Keepalive error (connection is warm)");
      }
    }, 120000); // Every 2 minutes

    return () => {
      clearInterval(keepaliveInterval);
      console.log("❄️ Stopped pre-warming connections");
    };
  }, [isRecording]);

  // Setup Supabase Realtime channel to broadcast timer to students
  useEffect(() => {
    const setupStudentTimerChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isRecording) return;

      const channelName = `lecture-timer-${user.id}`;
      console.log('📡 Setting up student timer broadcast channel:', channelName);
      
      studentTimerChannelRef.current = supabase.channel(channelName);
      await studentTimerChannelRef.current.subscribe((status: string) => {
        console.log('📡 Student timer channel status:', status);
      });
    };

    if (isRecording) {
      setupStudentTimerChannel();
    }

    return () => {
      if (studentTimerChannelRef.current) {
        console.log('📡 Closing student timer broadcast channel');
        supabase.removeChannel(studentTimerChannelRef.current);
        studentTimerChannelRef.current = null;
      }
    };
  }, [isRecording]);

  // Fetch student count, daily quota, custom limit, and auto-question settings on mount
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch student count
        const { data: students, error } = await supabase
          .from("instructor_students")
          .select("student_id")
          .eq("instructor_id", user.id);

        if (!error && students) {
          setStudentCount(students.length);
        }

        // Fetch instructor's custom daily limit and auto-question settings
        const { data: profile } = await supabase
          .from("profiles")
          .select("daily_question_limit, auto_question_enabled, auto_question_interval, auto_question_force_send, auto_question_strict_mode")
          .eq("id", user.id)
          .single();

        if (profile?.daily_question_limit) {
          setDailyQuotaLimit(profile.daily_question_limit);
        }

        if (profile) {
          setAutoQuestionEnabled(profile.auto_question_enabled || false);
          setAutoQuestionInterval(profile.auto_question_interval || 15);
          // Default to true if not explicitly set to false
          setAutoQuestionForceSend(profile.auto_question_force_send !== false);
          setStrictModeEnabled(profile.auto_question_strict_mode !== false);
        }

        // Fetch today's question count
        const today = new Date().toISOString().split("T")[0];
        const { count } = await supabase
          .from("student_assignments")
          .select("id", { count: "exact", head: true })
          .eq("instructor_id", user.id)
          .eq("assignment_type", "lecture_checkin")
          .gte("created_at", today);

        if (count !== null) {
          setDailyQuestionCount(count);
        }
      } catch (error) {
        console.error("Error fetching counts:", error);
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

  // Circuit breaker countdown
  useEffect(() => {
    if (isCircuitOpen && circuitBreakerRetryAt > Date.now()) {
      const interval = setInterval(() => {
        const secondsLeft = Math.ceil((circuitBreakerRetryAt - Date.now()) / 1000);
        if (secondsLeft > 0) {
          setCircuitBreakerCountdown(secondsLeft);
        } else {
          setIsCircuitOpen(false);
          setCircuitBreakerCountdown(0);
          setCircuitBreakerRetryAt(0);
          setFailureCount(0);
          toast({
            title: "🔄 System recovered",
            description: "Attempting to resume normal operation",
          });
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCircuitBreakerCountdown(0);
    }
  }, [isCircuitOpen, circuitBreakerRetryAt, toast]);

  // Quota circuit breaker countdown
  useEffect(() => {
    if (quotaErrorActive && quotaCircuitBreakerRetryAt > Date.now()) {
      const interval = setInterval(() => {
        const secondsLeft = Math.ceil((quotaCircuitBreakerRetryAt - Date.now()) / 1000);
        if (secondsLeft > 0) {
          setQuotaCircuitBreakerCountdown(secondsLeft);
        } else {
          setQuotaErrorActive(false);
          setQuotaCircuitBreakerCountdown(0);
          setQuotaCircuitBreakerRetryAt(0);
          setQuotaConsecutiveErrors(0);
          toast({
            title: "✅ API Quota May Be Available",
            description: "You can try resuming recording now",
          });
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setQuotaCircuitBreakerCountdown(0);
    }
  }, [quotaErrorActive, quotaCircuitBreakerRetryAt, toast]);

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
      console.log("🚫 Already sending a question, skipping detection");
      return false;
    }

    // Check if we're in a rate limit window
    const now = Date.now();
    if (now < nextQuestionAllowedAt) {
      console.log("⏱️ Rate limit active, skipping detection");
      return false;
    }

    // Cooldown check - prevent duplicate triggers
    if (now - lastDetectionTimeRef.current < MIN_DETECTION_INTERVAL) {
      console.log("⏱️ Cooldown active, skipping detection");
      return false;
    }

    // CONTEXT WINDOW VALIDATION: Only check last 100 characters for commands
    // Commands should be at the END of speech, not buried in middle
    const contextWindow = text.slice(-100);

    // PRE-VALIDATION: Check if there's actually a question before triggering
    const hasQuestionMark = text.includes("?");
    const questionWords = [
      "what",
      "how",
      "why",
      "when",
      "where",
      "who",
      "which",
      "whose",
      "whom",
      "can",
      "could",
      "would",
      "should",
      "is",
      "are",
      "do",
      "does",
    ];
    const lowerText = text.toLowerCase();
    const hasQuestionWords = questionWords.some((word) => {
      // Check for word boundaries to avoid false matches
      const regex = new RegExp(`\\b${word}\\b`, "i");
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

    const hasRegexMatch = commandPatterns.some((pattern) => pattern.test(contextWindow));

    // Method 2: Keyword-based detection (just needs "send" + "question")
    const lowerContext = contextWindow.toLowerCase();
    const hasKeywords =
      (lowerContext.includes("send") || lowerContext.includes("submit") || lowerContext.includes("push")) &&
      lowerContext.includes("question");

    // Method 3: Fuzzy matching for common command phrases with INCREASED threshold
    const targetPhrases = [
      "send question now",
      "send the question",
      "send question",
      "question now",
      "submit question",
    ];

    const hasFuzzyMatch = targetPhrases.some((phrase) => {
      // Check if phrase appears in context window with high similarity
      const words = lowerContext.split(/\s+/);
      for (let i = 0; i <= words.length - phrase.split(" ").length; i++) {
        const segment = words.slice(i, i + phrase.split(" ").length).join(" ");
        const similarity = calculateSimilarity(segment, phrase);
        if (similarity >= 0.85) {
          // INCREASED from 0.75 to 0.85 (85% similarity)
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
      console.log("⚠️ Command detected but no question evidence - likely false positive");
      return false;
    }

    const isDetected = commandDetected && hasQuestionEvidence;

    if (isDetected) {
      console.log("🎤 VOICE COMMAND DETECTED:", {
        contextWindow: contextWindow,
        hasQuestionMark,
        hasQuestionWords,
        regexMatch: hasRegexMatch,
        keywordMatch: hasKeywords,
        fuzzyMatch: hasFuzzyMatch,
        chunkIndex: currentChunkIndex,
      });

      // CRITICAL: Set cooldown IMMEDIATELY to prevent re-detection
      lastDetectionTimeRef.current = now;
      lastDetectedChunkIndexRef.current = currentChunkIndex;

      // DON'T clear the buffer here - we need the full question for extraction
      // The command phrase will be filtered by the AI during extraction

      handleVoiceCommandQuestion();
      return true;
    }

    return false;
  };

  const handleVoiceCommandQuestion = async () => {
    // Prevent multiple simultaneous sends
    if (isSendingQuestion) {
      console.log("🚫 Already processing a question, ignoring duplicate trigger");
      return;
    }

    try {
      setIsSendingQuestion(true);

      // Trigger visual feedback immediately
      setVoiceCommandDetected(true);
      setTimeout(() => setVoiceCommandDetected(false), 2000);

      console.log("🎤 Voice command triggered! Processing...");

      toast({
        title: "🎤 Voice command detected!",
        description: "Capturing final speech...",
        duration: 3000,
      });

      // CRITICAL: Wait 2.5 seconds for:
      // 1. User to finish speaking any remaining words
      // 2. Transcription service to process final audio chunks
      // 3. Network latency and slower speakers
      console.log("⏳ Waiting 2.5s for transcription to complete...");

      // Visual countdown for instructor feedback
      for (let i = 25; i >= 0; i--) {
        setBatchProgress(`⏱️ Capturing speech... ${(i / 10).toFixed(1)}s`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      setBatchProgress("");

      // Get last ~60-90 seconds of transcript (increased for better context)
      // Ensure we don't cut off mid-word
      let recentTranscript = transcriptBufferRef.current.slice(-3000); // Increased from 2000 for more context

      // Trim to nearest word boundary at the start to avoid partial words
      const firstSpaceIndex = recentTranscript.indexOf(" ");
      if (firstSpaceIndex > 0 && firstSpaceIndex < 100) {
        recentTranscript = recentTranscript.slice(firstSpaceIndex + 1);
      }

      console.log("📝 Extracting question from transcript:", recentTranscript.length, "chars");
      console.log("🔍 Last 200 chars:", recentTranscript.slice(-200));

      const { data, error } = await supabase.functions.invoke("extract-voice-command-question", {
        body: { recentTranscript },
      });

      if (error) {
        console.error("Extract error:", error);
        throw error;
      }

      if (!data?.success || !data?.question_text) {
        // Check if we have a partial question to show user
        if (data?.partial_question && data?.retryable) {
          setPartialQuestion(data.partial_question);
          setEditedQuestion(data.partial_question);
          setShowExtractionDialog(true);

          addError(
            "warning",
            "extraction",
            "Question extraction incomplete",
            `${data.error || "Validation failed"} - Partial: "${data.partial_question}"`,
            true,
          );
          return;
        }

        // SUPPRESS ERROR: This is likely a false positive detection
        // Log it silently instead of showing error toast to user
        console.log("⚠️ No question found in transcript - likely false positive detection");
        console.log("Transcript analyzed:", recentTranscript.slice(-200));

        addError("info", "extraction", "No question found in transcript", "Likely false positive detection", false);
        return;
      }

      console.log("✅ Question extracted via voice command:", data.question_text);

      // Send immediately without confidence threshold
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0, // Voice command = maximum confidence
        extraction_method: "voice_command",
        source: "voice_command",
      });

      // Reset auto-question timer after voice command
      if (autoQuestionEnabled) {
        setLastAutoQuestionTime(Date.now());
        intervalTranscriptRef.current = "";
        setIntervalTranscriptLength(0);
        console.log("🔄 Auto-question timer reset after voice command");
      }
    } catch (error: any) {
      console.error("Voice command error:", error);

      // Check if this is a rate limit error (don't show as "failed")
      if (error.message?.includes("wait") || error.message?.includes("seconds between")) {
        // Rate limit error is already handled by handleQuestionSend
        // Just log it, don't show duplicate error
        console.log("ℹ️ Rate limit applied, countdown shown to user");
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
      console.log("🚫 Already processing a question");
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

      console.log("📝 Manual send - extracting question from transcript:", recentTranscript.length, "chars");

      const { data, error } = await supabase.functions.invoke("extract-voice-command-question", {
        body: { recentTranscript },
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

      console.log("✅ Question extracted via manual send:", data.question_text);

      // Send immediately
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0,
        extraction_method: "manual_button",
        source: "manual_button",
      });

      // Reset auto-question timer after manual send
      if (autoQuestionEnabled) {
        setLastAutoQuestionTime(Date.now());
        intervalTranscriptRef.current = "";
        setIntervalTranscriptLength(0);
        console.log("🔄 Auto-question timer reset after manual send");
      }
    } catch (error: any) {
      console.error("Manual send error:", error);
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
          error: `⏱️ Please wait ${secondsLeft} seconds before sending another question`,
        };
      }

      // Check if user is authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        return {
          valid: false,
          error: "🔐 Session expired - please refresh the page",
        };
      }

      // Check if students are connected
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return {
          valid: false,
          error: "🔐 Authentication required - please refresh the page",
        };
      }

      const { data: students, error: studentsError } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id);

      if (studentsError) {
        console.error("Error checking students:", studentsError);
        return {
          valid: false,
          error: "❌ Could not verify student connections",
        };
      }

      if (!students || students.length === 0) {
        return {
          valid: false,
          error: "👥 No students connected - please share your instructor code with students",
        };
      }

      // Check if there's enough transcript content (skip for auto-questions - already checked)
      if (!isAutoQuestion && (!transcriptBufferRef.current || transcriptBufferRef.current.length < 30)) {
        return {
          valid: false,
          error: "📝 Not enough lecture content - continue speaking for a few more seconds",
        };
      }

      return { valid: true };
    } catch (error: any) {
      console.error("Validation error:", error);
      return {
        valid: false,
        error: "❌ Validation failed - please try again",
      };
    }
  };

  // Retry logic with exponential backoff
  const retryWithBackoff = async <T,>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
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
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };

  const handleQuestionSend = async (detectionData: any) => {
    try {
      console.log("📤 Sending question to students:", detectionData);

      // Pre-validation (pass true for auto-questions to skip rate limit check)
      const validation = await validateBeforeSend(detectionData.source === "auto_interval");
      if (!validation.valid) {
        console.error("❌ Pre-validation failed:", validation.error);
        console.error("❌ Source:", detectionData.source || "unknown");
        console.error("❌ Question:", detectionData.question_text?.substring(0, 100));

        toast({
          title: "Cannot send question",
          description: validation.error,
          variant: "destructive",
          duration: 5000,
        });
        return;
      }

      // Refresh token before critical operation
      console.log("🔑 Refreshing auth token before send");
      await supabase.auth.refreshSession();

      // Broadcast question sent event to presenter popup (BroadcastChannel)
      broadcast('question_sent', {
        lastQuestionSent: {
          question: getQuestionPreview(detectionData.question_text, 100),
          type: detectionData.suggested_type || 'multiple_choice',
          timestamp: new Date().toISOString(),
        },
      });

      // Broadcast to students via Supabase Realtime - reset their timers
      if (studentTimerChannelRef.current) {
        studentTimerChannelRef.current.send({
          type: 'broadcast',
          event: 'question_sent',
          payload: { timestamp: new Date().toISOString() }
        });
      }

      toast({
        title: "🎯 Question detected!",
        description: `"${getQuestionPreview(detectionData.question_text, 60)}..." - Sending to students...`,
      });

      // Show progress indicator immediately
      setBatchProgress("📝 Extracting and formatting question...");

      // Provide richer context for better question formatting
      const fullContext = transcriptBufferRef.current.slice(-1500);

      // Retry logic for transient failures with progress tracking
      const sendStartTime = Date.now();
      const { data, error } = await retryWithBackoff(async () => {
        return await supabase.functions.invoke("format-and-send-question", {
          body: {
            question_text: detectionData.question_text,
            suggested_type: detectionData.suggested_type,
            context: fullContext,
            confidence: detectionData.confidence,
            source: detectionData.source || "manual_button",
          },
        });
      });

      const totalTime = Date.now() - sendStartTime;
      console.log(`⏱️ Total send time: ${totalTime}ms`);

      console.log("📥 Edge function response:", { data, error });

      // Show detailed progress if available
      if (data?.processing_time_ms) {
        const timeStr =
          data.processing_time_ms < 1000
            ? `${data.processing_time_ms}ms`
            : `${(data.processing_time_ms / 1000).toFixed(1)}s`;
        const upgradingNote = data?.upgrading_to_mcq ? " (upgrading to MCQ...)" : "";
        const parallelNote = data?.parallel_batches ? " ⚡" : "";
        setBatchProgress(
          `✅ Sent to ${data.sent_to}/${data.total_students} students in ${timeStr}${parallelNote}${upgradingNote}`,
        );
        setTimeout(() => setBatchProgress(""), data?.upgrading_to_mcq ? 6000 : 4000);
      } else if (data?.batches_processed && data?.total_students) {
        setBatchProgress(`✅ Sent to ${data.total_students} students in ${data.batches_processed} batches`);
        setTimeout(() => setBatchProgress(""), 3000);
      }

      if (error) {
        console.error("❌ Edge function error:", error);

        // Enhanced error handling with user-friendly messages
        let errorMessage = error.message || "An unexpected error occurred";
        let errorType = "unknown";

        // Parse error from response data if available
        if (data?.error) {
          errorMessage = data.error;
          errorType = data.error_type || "unknown";
        }

        // Handle 429 Rate Limit - distinguish between cooldown and daily limit
        if (
          error.message?.includes("429") ||
          error.status === 429 ||
          errorType === "cooldown" ||
          errorType === "daily_limit"
        ) {
          const errorData = data || {};

          // Check if this is daily limit or cooldown
          if (errorType === "daily_limit" || errorData.quota_reset) {
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
            const retryAfter = errorData.retry_after || 15;
            const nextAllowed = Date.now() + retryAfter * 1000;
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
        if (error.status === 401 || errorMessage.includes("Session expired") || errorMessage.includes("Unauthorized")) {
          toast({
            title: "🔐 Session expired",
            description: "Please refresh the page to continue",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }

        // Handle 400 bad request
        if (error.status === 400 || errorMessage.includes("Invalid")) {
          toast({
            title: "❌ Invalid question",
            description: errorMessage,
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }

        // Handle AI-specific errors
        if (
          errorMessage.includes("AI service") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("quota")
        ) {
          toast({
            title: "⚠️ AI Service Issue",
            description: errorMessage,
            variant: "destructive",
            duration: 7000,
          });
          throw error;
        }

        // Handle timeout errors
        if (errorMessage.includes("timed out") || errorMessage.includes("timeout")) {
          toast({
            title: "⏱️ Request timed out",
            description: "The AI service took too long to respond. Please try again.",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }

        // Handle 500 server errors
        if (error.status === 500 || error.status === 504) {
          toast({
            title: "❌ Server busy",
            description: "The server is experiencing high load. Retrying in 3...2...1...",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }

        // Handle network errors
        if (error.message?.includes("fetch") || error.message?.includes("network")) {
          toast({
            title: "🌐 Connection issue",
            description: "Please check your internet connection and try again",
            variant: "destructive",
            duration: 5000,
          });
          throw error;
        }

        // Generic error handling with technical details hidden
        toast({
          title: "❌ Unable to send question",
          description: errorMessage.substring(0, 100),
          variant: "destructive",
          duration: 5000,
        });

        throw error;
      }

      if (data?.success) {
        console.log("✅ Question successfully sent!");

        // Play audio notification for instructor
        playNotificationSound().catch(err => 
          console.log('Could not play notification sound:', err)
        );

        // Update daily count
        setDailyQuestionCount((prev) => prev + 1);

        // Enhanced success notification
        toast({
          title: "✅ Question sent successfully!",
          description: `${data.question_type} delivered to ${data.sent_to} student${data.sent_to !== 1 ? 's' : ''} in ${data.processing_time_ms < 1000 ? `${data.processing_time_ms}ms` : `${(data.processing_time_ms / 1000).toFixed(1)}s`}`,
          duration: 6000,
        });
        
        // Additional visual feedback
        sonnerToast.success("Question Delivered!", {
          description: `${data.sent_to} student${data.sent_to !== 1 ? 's' : ''} received your question`,
          duration: 5000,
        });
        
        onQuestionGenerated();

        // After successful send, extend the cooldown and record send time
        lastDetectionTimeRef.current = Date.now();
        lastQuestionSentTimeRef.current = Date.now();
      } else {
        console.error("❌ Question send failed:", data);
        throw new Error(data?.message || "Failed to send question");
      }
    } catch (error: any) {
      console.error("❌ Failed to send question:", error);

      // Don't show duplicate toasts if already handled above
      if (
        !error.status ||
        (error.status !== 429 && error.status !== 400 && error.status !== 401 && error.status !== 500)
      ) {
        // Check if it's a network error
        if (error.message?.includes("fetch") || error.message?.includes("network")) {
          // Already handled above
        } else {
          toast({
            title: "❌ Failed to send question",
            description: error.message || "An unexpected error occurred. Please try again.",
            variant: "destructive",
            duration: 5000,
          });

          addError(
            "critical",
            "question_send",
            "Failed to send question",
            error.message || "An unexpected error occurred",
            true,
          );
        }
      }
      throw error;
    }
  };

  // Core auto-question generation logic (extracted for reuse) with enhanced logging
  const generateAndSendAutoQuestion = async (intervalTranscript: string, isManualTest = false) => {
    const startTime = Date.now();

    try {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🎯 STARTING AUTO-QUESTION GENERATION");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 Input Parameters:");
      console.log("  - Transcript length:", intervalTranscript.length, "chars");
      console.log("  - Interval:", autoQuestionInterval, "minutes");
      console.log("  - Manual test:", isManualTest);
      console.log("  - Is sending:", isSendingQuestion);
      console.log("  - Recording:", isRecording);
      console.log("  - Transcript preview:", intervalTranscript.substring(0, 150) + "...");
      console.log(
        "  - Transcript ending:",
        "..." + intervalTranscript.substring(Math.max(0, intervalTranscript.length - 150)),
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

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

      // Fetch instructor's format preference before generating
      console.log("🔍 Fetching user authentication...");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error("❌ No authenticated user found");
        toast({
          title: "❌ Authentication error",
          description: "Please refresh the page and try again",
          variant: "destructive",
        });
        return false;
      }
      console.log("✅ User authenticated:", user.id);

      console.log("🔍 Fetching format preference...");
      const { data: profile } = await supabase
        .from("profiles")
        .select("question_format_preference")
        .eq("id", user.id)
        .single();

      const formatPreference = profile?.question_format_preference || "multiple_choice";
      console.log("✅ Format preference:", formatPreference);

      // Fetch and parse lecture materials for context
      console.log("📚 Fetching lecture materials...");
      const { data: materials } = await supabase
        .from("lecture_materials")
        .select("id, title, description, file_path, file_type")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3); // Get most recent 3 materials for auto-questions

      let materialContext: any[] = [];
      if (materials && materials.length > 0) {
        console.log("📖 Parsing", materials.length, "materials...");
        const parsePromises = materials.map(async (material) => {
          try {
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
              content: data.text?.slice(0, 2000), // Limit to 2000 chars per material
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

      // Call edge function with format preference, materials, and strict mode
      console.log("📡 Invoking generate-interval-question edge function...");
      console.log("🔗 Payload:", {
        interval_transcript_length: intervalTranscript.length,
        interval_minutes: autoQuestionInterval,
        format_preference: formatPreference,
        force_send: autoQuestionForceSend,
        strict_mode: strictModeEnabled,
        materials_count: materialContext.length,
        retry_queue_size: retryQueue.length,
      });

      const invokeStartTime = Date.now();
      const { data, error } = await supabase.functions.invoke("generate-interval-question", {
        body: {
          interval_transcript: intervalTranscript,
          interval_minutes: autoQuestionInterval,
          format_preference: formatPreference,
          force_send: autoQuestionForceSend,
          strict_mode: strictModeEnabled,
          materialContext: materialContext,
          retry_context: retryQueue.length > 0 ? retryQueue : null,
        },
      });
      const invokeTime = Date.now() - invokeStartTime;

      // Clear retry queue on successful invocation attempt
      if (retryQueue.length > 0) {
        console.log("🧹 Clearing retry queue after attempt");
        setRetryQueue([]);
        setAutoQuestionMetrics(prev => ({ ...prev, retryQueueSize: 0 }));
      }

      console.log(`⏱️ Edge function completed in ${invokeTime}ms`);
      console.log("📥 Response:", {
        hasData: !!data,
        hasError: !!error,
        success: data?.success,
        dataKeys: data ? Object.keys(data) : [],
        errorMessage: error?.message,
      });

      if (error || !data?.success) {
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error("❌ EDGE FUNCTION ERROR");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error("  Has error:", !!error);
        console.error("  Success flag:", data?.success);
        console.error("  Error object:", JSON.stringify(error, null, 2));
        console.error("  Data object:", JSON.stringify(data, null, 2));
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        let errorMessage = "Could not generate question from recent content.";

        // Parse specific error types
        if (data?.error?.includes("Rate limit") || data?.error_type === "cooldown") {
          errorMessage = `⏳ Rate limit: Wait ${data?.retry_after || 15}s before next question`;
          console.log("⏳ Rate limit hit, keeping transcript for retry");
        } else if (data?.error?.includes("Daily limit") || data?.error_type === "daily_limit") {
          errorMessage = `🚫 Daily limit reached (${data?.current_count}/${data?.daily_limit}). Resets in ${data?.hours_until_reset}h ${data?.minutes_until_reset}m`;
        } else if (data?.error?.includes("Not enough content")) {
          errorMessage = `Need ${100 - intervalTranscript.length} more characters of lecture content.`;
        } else if (data?.error?.includes("confidence threshold")) {
          errorMessage = `AI confidence too low (${(data.confidence * 100)?.toFixed(0) || "?"}%). Keep teaching for better questions.`;
        } else if (data?.error) {
          errorMessage = data.error;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        setLastAutoQuestionError(errorMessage);
        setLastAutoQuestionErrorTime(new Date());

        toast({
          title: isManualTest ? "🧪 Test Failed" : "⚠️ Auto-question skipped",
          description: errorMessage,
          variant: data?.error_type === "daily_limit" ? "destructive" : "default",
          duration: 5000,
        });

        return false;
      }

      console.log("✅ Question generated successfully");
      console.log("  Question text:", getQuestionPreview(data.question_text, 100) + "...");
      console.log("  Type:", data.suggested_type);
      console.log("  Confidence:", data.confidence);

      // Client-side validation of question completeness
      if (typeof data.question_text === "string") {
        const question = data.question_text.trim();

        // Check for obvious truncation
        if (
          question.length < 10 ||
          (question.split(" ").length > 3 && !question.endsWith("?") && !question.endsWith("."))
        ) {
          console.error("⚠️ Received potentially truncated question:", question);
          toast({
            title: "⚠️ Question may be incomplete",
            description: `"${question.substring(0, 50)}..." - Skipping to avoid sending incomplete question`,
            variant: "destructive",
            duration: 5000,
          });
          return false;
        }
      } else if (typeof data.question_text === "object" && data.question_text?.title) {
        // Coding questions are valid as objects
        console.log("✅ Coding question validated");
      }

      console.log("📝 Sending via handleQuestionSend...");

      // Send the question using existing flow
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: data.confidence,
        extraction_method: "auto_interval",
        source: isManualTest ? "manual_test" : "auto_interval",
      });

      const totalTime = Date.now() - startTime;
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ AUTO-QUESTION COMPLETED SUCCESSFULLY");
      console.log("  Total time:", totalTime + "ms");
      console.log("  Question sent:", getQuestionPreview(data.question_text, 60) + "...");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Clear error state on success
      setLastAutoQuestionError(null);
      setRetryAttempts(0);

      // Track success metrics (including fallbacks)
      setAutoQuestionMetrics((prev) => {
        const totalQuality = prev.averageQuality * prev.questionsSent + data.confidence;
        const newCount = prev.questionsSent + 1;
        return {
          ...prev,
          questionsSent: newCount,
          averageQuality: totalQuality / newCount,
          intervalsCompleted: prev.intervalsCompleted + 1,
          fallbacksUsed: data.is_fallback ? prev.fallbacksUsed + 1 : prev.fallbacksUsed,
        };
      });

      // Log if fallback was used
      if (data.is_fallback) {
        console.log("📋 Fallback question used due to:", data.reasoning);
      }

      // Update state
      setAutoQuestionCount((prev) => prev + 1);

      // Clear interval transcript buffer and reset quality
      intervalTranscriptRef.current = "";
      intervalStartTimeRef.current = Date.now(); // Reset start time
      setIntervalTranscriptLength(0);
      setContentQualityScore(0);

      console.log(`✅ Auto-question complete! Session total: ${autoQuestionCount + 1}`);

      if (isManualTest) {
        toast({
          title: "🧪 Test Successful!",
          description: `Question sent: "${getQuestionPreview(data.question_text, 50)}..."`,
          duration: 5000,
        });
      }

      return true;
    } catch (error: any) {
      const totalTime = Date.now() - startTime;
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("❌ AUTO-QUESTION GENERATION EXCEPTION");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("  Error type:", typeof error);
      console.error("  Error message:", error?.message);
      console.error("  Error name:", error?.name);
      console.error("  Error details:", JSON.stringify(error, null, 2));
      console.error("  Time elapsed:", totalTime + "ms");
      console.error("  Stack trace:", error?.stack);
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const errorMsg = error?.message || "Unknown error during auto-question generation";
      setLastAutoQuestionError(errorMsg);
      setLastAutoQuestionErrorTime(new Date());

      toast({
        title: isManualTest ? "🧪 Test Error" : "❌ Auto-question error",
        description: errorMsg.substring(0, 100),
        variant: "destructive",
        duration: 5000,
      });

      // Add current transcript to retry queue for next attempt (only if we have content)
      if (intervalTranscriptRef.current && intervalTranscriptRef.current.length > 50) {
        setRetryQueue(prev => {
          const newQueue = [...prev, intervalTranscriptRef.current].slice(-3); // Keep last 3
          setAutoQuestionMetrics(prevMetrics => ({ ...prevMetrics, retryQueueSize: newQueue.length }));
          console.log("📥 Added to retry queue, size:", newQueue.length);
          return newQueue;
        });
      }

      // Don't clear transcript on errors - let it keep building up
      console.log("⏭️ Keeping transcript for retry (length:", intervalTranscriptRef.current.length, ")");
      return false;
    } finally {
      setIsSendingQuestion(false);
    }
  };

  // Handle auto-question generation (called by timer)
  const handleAutoQuestionGeneration = async (): Promise<boolean> => {
    try {
      console.log("⏰ Auto-question timer triggered");

      // Get transcript from current interval only
      const intervalTranscript = intervalTranscriptRef.current;

      // Calculate actual elapsed time since interval started
      const actualElapsedSeconds =
        intervalStartTimeRef.current > 0
          ? Math.max(1, (Date.now() - intervalStartTimeRef.current) / 1000)
          : autoQuestionInterval * 60;

      // Use sliding window if transcript is too long
      const expectedWords = autoQuestionInterval * 150; // ~150 WPM average
      const actualWordCount = intervalTranscript.split(/\s+/).length;
      let transcriptToAnalyze = intervalTranscript;

      if (actualWordCount > expectedWords * 2) {
        // Take only the most recent portion
        const words = intervalTranscript.split(/\s+/);
        const recentWords = words.slice(-expectedWords);
        transcriptToAnalyze = recentWords.join(" ");
        console.log(`📐 Using sliding window: ${recentWords.length}/${words.length} words`);
      }

      console.log("📝 Interval transcript:", {
        length: intervalTranscript.length,
        wordCount: actualWordCount,
        actualElapsedSeconds,
        preview: intervalTranscript.substring(0, 100) + "...",
      });

      // Enhanced content quality check with ACTUAL elapsed time
      const qualityMetrics = analyzeContentQuality(transcriptToAnalyze, actualElapsedSeconds);

      console.log("📊 Content quality metrics:", {
        wordCount: qualityMetrics.wordCount,
        density: (qualityMetrics.contentDensity * 100).toFixed(1) + "%",
        isQuality: qualityMetrics.isQualityContent,
        isPause: qualityMetrics.isPause,
        wpm: qualityMetrics.wordsPerMinute.toFixed(0),
      });

      // Minimal character check - just ensure there's some content to work with
      // Skip this check if force send mode is enabled
      if (!autoQuestionForceSend && intervalTranscript.length < 50) {
        console.log("⚠️ Not enough content in interval:", intervalTranscript.length, "chars (need 50+)");

        // Track skip reason
        const skipReason: SkipReason = {
          timestamp: new Date(),
          reason: "Insufficient content",
          details: `${intervalTranscript.length}/50 chars`,
        };
        setAutoQuestionMetrics((prev) => ({
          ...prev,
          questionsSkipped: prev.questionsSkipped + 1,
          skipReasons: [...prev.skipReasons, skipReason],
        }));

        toast({
          title: "⏭️ Auto-question skipped",
          description: `Need ${50 - intervalTranscript.length} more characters of lecture content`,
          duration: 3000,
        });
        return false;
      }

      if (autoQuestionForceSend && intervalTranscript.length < 50) {
        console.log("🔥 Force send mode: Bypassing 50-char minimum check");
      }

      // Quality metrics for debugging only - NOT used for blocking
      console.log("📊 Content Metrics (informational only):", {
        wordCount: actualWordCount,
        density: `${(qualityMetrics.contentDensity * 100).toFixed(1)}%`,
        isPause: qualityMetrics.isPause,
        wpm: qualityMetrics.wordsPerMinute.toFixed(0),
        transcriptLength: intervalTranscript.length,
      });

      // Use the sliding window content for generation (same as we analyzed)
      return await generateAndSendAutoQuestion(transcriptToAnalyze, false);
    } catch (error) {
      console.error("Auto-question error:", error);
      return false;
    }
  };

  // Manual test function for debugging with detailed logging
  const handleTestAutoQuestion = async () => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 MANUAL TEST AUTO-QUESTION TRIGGERED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const intervalTranscript = intervalTranscriptRef.current.trim();

    console.log("📊 Test Pre-checks:");
    console.log("  - Transcript length:", intervalTranscript.length);
    console.log("  - Is sending:", isSendingQuestion);
    console.log("  - Is recording:", isRecording);
    console.log("  - Auto-enabled:", autoQuestionEnabled);

    if (intervalTranscript.length < 100) {
      console.log("❌ Test blocked: insufficient transcript");
      toast({
        title: "🧪 Cannot Test",
        description: `Need at least 100 characters. Current: ${intervalTranscript.length}`,
        variant: "destructive",
      });
      return;
    }

    if (isSendingQuestion) {
      console.log("❌ Test blocked: already sending a question");
      toast({
        title: "⏳ Please Wait",
        description: "A question is already being processed",
      });
      return;
    }

    console.log("✅ All pre-checks passed, starting test...");
    toast({
      title: "🧪 Testing Auto-Question",
      description: "Generating question from current interval content...",
    });

    await generateAndSendAutoQuestion(intervalTranscript, true);
  };

  // Toggle auto-question enabled state
  const handleToggleAutoQuestion = async () => {
    const newState = !autoQuestionEnabled;
    console.log(`🔄 Toggling auto-questions: ${autoQuestionEnabled} → ${newState}`);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("profiles").update({ auto_question_enabled: newState }).eq("id", user.id);

      if (error) throw error;

      setAutoQuestionEnabled(newState);

      // Reset timer when enabling
      if (newState) {
        setLastAutoQuestionTime(0);
        setRetryAttempts(0);
        setLastAutoQuestionError(null);
      }

      toast({
        title: newState ? "✅ Auto-Questions Enabled" : "⏸️ Auto-Questions Disabled",
        description: newState
          ? `Questions will be generated every ${autoQuestionInterval} minutes`
          : "Auto-question generation has been paused",
      });

      console.log("✅ Auto-question state updated successfully");
    } catch (error) {
      console.error("Failed to toggle auto-question:", error);
      toast({
        title: "Error",
        description: "Failed to update auto-question setting",
        variant: "destructive",
      });
    }
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

  // Auto-question timer logic with comprehensive logging
  useEffect(() => {
    console.log("🔍 Auto-question timer effect triggered:", {
      isRecording,
      autoQuestionEnabled,
      isSendingQuestion,
      lastAutoQuestionTime,
      autoQuestionInterval,
    });

    if (!isRecording) {
      console.log("⏸️ Timer paused: not recording");
      return;
    }

    if (!autoQuestionEnabled) {
      console.log("⏸️ Timer paused: auto-questions disabled");
      return;
    }

    if (isSendingQuestion) {
      console.log("⏸️ Timer paused: already sending a question");
      return;
    }

    const intervalMs = autoQuestionInterval * 60 * 1000; // Convert minutes to ms

    // Initialize timer on first recording start
    if (lastAutoQuestionTime === 0) {
      const now = Date.now();
      setLastAutoQuestionTime(now);
      intervalStartTimeRef.current = now; // Track actual start time
      setAutoQuestionCount(0);
      console.log(`🟢 Auto-questions initialized: every ${autoQuestionInterval} minutes (${intervalMs}ms)`);
      console.log("🕐 First question will trigger at:", new Date(now + intervalMs).toLocaleTimeString());
    }

    // Check if interval has elapsed
    const checkInterval = setInterval(() => {
      if (isSendingQuestion) {
        console.log("⏸️ Skipping check: already sending a question");
        return;
      }
      if (isGeneratingAutoQuestionRef.current) {
        console.log("⏸️ Skipping check: generation in progress");
        return;
      }
      if (isProcessing) {
        console.log("⏸️ Skipping check: audio processing");
        return;
      }

      const now = Date.now();
      const elapsed = now - lastAutoQuestionTime;
      const timeLeft = intervalMs - elapsed;
      const secondsLeft = Math.max(0, Math.ceil(timeLeft / 1000));

      setNextAutoQuestionIn(secondsLeft);

      // Broadcast countdown tick to presenter popup (BroadcastChannel)
      broadcast('countdown_tick', {
        nextAutoQuestionIn: secondsLeft,
        autoQuestionEnabled,
        autoQuestionInterval,
        isRecording,
        studentCount,
        recordingDuration,
      });

      // Broadcast to students via Supabase Realtime (every 5 seconds or when urgent)
      if (studentTimerChannelRef.current && (secondsLeft % 5 === 0 || secondsLeft <= 10)) {
        studentTimerChannelRef.current.send({
          type: 'broadcast',
          event: 'timer_update',
          payload: {
            nextQuestionIn: secondsLeft,
            intervalMinutes: autoQuestionInterval,
            autoQuestionEnabled,
            isRecording,
          }
        });
      }

      // Log countdown at key intervals
      if (secondsLeft === 60 || secondsLeft === 30 || secondsLeft === 10) {
        console.log(`⏰ Auto-question in ${secondsLeft} seconds`);
      }

      // Trigger when interval is reached
      if (elapsed >= intervalMs) {
        // Set lock IMMEDIATELY before any async work
        isGeneratingAutoQuestionRef.current = true;

        console.log("🚀 AUTO-QUESTION INTERVAL REACHED");
        console.log("📊 Timer State:", {
          elapsed: `${(elapsed / 1000).toFixed(0)}s`,
          intervalMs: `${(intervalMs / 1000).toFixed(0)}s`,
          transcriptLength: intervalTranscriptRef.current.length,
          transcriptWords: intervalTranscriptRef.current.split(/\s+/).length,
          lastAutoQuestionTime: new Date(lastAutoQuestionTime).toLocaleTimeString(),
          intervalStartTime: new Date(intervalStartTimeRef.current).toLocaleTimeString(),
          now: new Date(now).toLocaleTimeString(),
          autoQuestionEnabled,
          isSendingQuestion,
        });

        // Call async function with enhanced error handling and retry logic
        handleAutoQuestionGeneration()
          .then((success) => {
            if (success) {
              // Question sent successfully - reset timer
              const newTime = Date.now();
              setLastAutoQuestionTime(newTime);
              intervalStartTimeRef.current = newTime;
              setRetryAttempts(0);
              setLastAutoQuestionError(null);
              console.log("✅ Timer reset after successful send");
              console.log("🕐 Next question at:", new Date(newTime + intervalMs).toLocaleTimeString());
            } else {
              // Quality check failed - reset timer with 30-second delay
              const retryTime = Date.now() - (intervalMs - 30000);
              setLastAutoQuestionTime(retryTime);
              console.log("⏭️ Quality check failed, will retry in 30 seconds");
            }
          })
          .catch((error) => {
            console.error("❌ Auto-question generation failed:", error);
            const errorMsg = error?.message || "Unknown error";
            setLastAutoQuestionError(errorMsg);
            setLastAutoQuestionErrorTime(new Date());

            // Retry logic: wait 5 seconds then try again
            if (retryAttempts < 1) {
              console.log("🔄 Will retry in 5 seconds...");
              setRetryAttempts((prev) => prev + 1);
              setTimeout(() => {
                console.log("🔄 Retrying auto-question generation...");
                const retryTime = Date.now() - (intervalMs - 5000); // Retry in 5s
                setLastAutoQuestionTime(retryTime);
                isGeneratingAutoQuestionRef.current = false;
              }, 5000);
            } else {
              console.log("❌ Max retries reached, resetting timer");
              setRetryAttempts(0);
              const retryTime = Date.now() - (intervalMs - 60000); // Retry in 1 minute
              setLastAutoQuestionTime(retryTime);
            }
          })
          .finally(() => {
            if (retryAttempts >= 1) {
              // Don't unlock if we're about to retry
              return;
            }
            isGeneratingAutoQuestionRef.current = false;
          });
      }
    }, 1000);

    return () => {
      console.log("🧹 Cleaning up auto-question timer");
      clearInterval(checkInterval);
    };
  }, [isRecording, autoQuestionEnabled, lastAutoQuestionTime, autoQuestionInterval, isSendingQuestion, retryAttempts]);

  // Initialize timer when auto-questions are toggled on during recording
  useEffect(() => {
    if (autoQuestionEnabled && isRecording && lastAutoQuestionTime === 0) {
      const now = Date.now();
      setLastAutoQuestionTime(now);
      intervalStartTimeRef.current = now;
      setAutoQuestionCount(0);
      console.log("⏰ Auto-question timer started mid-recording, first question in", autoQuestionInterval, "minutes");
    }
  }, [autoQuestionEnabled, isRecording, lastAutoQuestionTime, autoQuestionInterval]);

  // Reset auto-question state when recording stops
  useEffect(() => {
    if (!isRecording) {
      setLastAutoQuestionTime(0);
      setNextAutoQuestionIn(0);
      setAutoQuestionCount(0);
      setIntervalTranscriptLength(0);
      setContentQualityScore(0);
      intervalTranscriptRef.current = "";
      isGeneratingAutoQuestionRef.current = false;
    }
  }, [isRecording]);

  // Recording duration timer + broadcast
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }

    const startTime = Date.now();
    durationTimerRef.current = setInterval(() => {
      const newDuration = Math.floor((Date.now() - startTime) / 1000);
      setRecordingDuration(newDuration);
      
      // Broadcast state update every second
      broadcast('state_update', {
        isRecording: true,
        recordingDuration: newDuration,
        autoQuestionEnabled,
        autoQuestionInterval,
        studentCount,
        transcriptLength: transcriptBufferRef.current.length,
        contentQualityScore,
      });

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
  }, [isRecording, nextQuestionAllowedAt, autoQuestionEnabled, autoQuestionInterval, studentCount, contentQualityScore, broadcast]);

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

  // Handle streaming transcripts from Deepgram
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

      if (quotaErrorActive) {
        toast({
          title: "⏳ Quota Paused",
          description: "Recording is temporarily paused due to quota. See banner for details.",
          variant: "destructive",
        });
        return;
      }

      // Detect mobile/iOS for flexible audio constraints
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Request microphone access with flexible constraints for mobile
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: isMobile || isIOS || isSafari ? {
          // Flexible constraints for mobile - let browser choose optimal settings
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : {
          // Strict constraints for desktop
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);

      // Reset state for fresh recording session
      hasTriggeredRef.current = false;
      setTranscriptChunks([]);
      transcriptBufferRef.current = "";
      intervalTranscriptRef.current = "";
      setFailureCount(0);
      setIsCircuitOpen(false);
      lastDetectionTimeRef.current = 0;
      lastDetectedChunkIndexRef.current = -1;

      // Initialize auto-question timer for this session
      if (autoQuestionEnabled) {
        const now = Date.now();
        setLastAutoQuestionTime(now);
        intervalStartTimeRef.current = now;
        setAutoQuestionCount(0);
        console.log("⏰ Auto-question timer initialized, first question in", autoQuestionInterval, "minutes");
      }

      // Start chunk-based recording cycle
      startRecordingCycle();

      toast({
        title: "🎙️ Recording started",
        description: isMobile 
          ? "Mobile recording active. Keep screen on for best results." 
          : "Transcripts will appear every 8 seconds",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to start recording";
      toast({
        title: "Failed to start recording",
        description: errorMessage,
        variant: "destructive",
      });
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

      // Try to use the best available audio format (including iOS Safari support)
      const mimeTypes = [
        "audio/webm;codecs=opus",    // Chrome, Firefox, Edge
        "audio/webm",                 // Fallback for Chrome/Firefox
        "audio/mp4",                  // iOS Safari, newer Safari
        "audio/mp4;codecs=mp4a.40.2", // iOS Safari with specific codec
        "audio/ogg;codecs=opus",      // Firefox fallback
      ];

      let mimeType = "";
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      if (!mimeType) {
        throw new Error("No supported audio format found on this device");
      }

      console.log("📱 Selected MIME type:", mimeType);

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

    // Clean up recording interval
    if (recordingIntervalRef.current) {
      clearTimeout(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current = null;
    }

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
              console.log("🔇 Suppressing transcription error (question just sent)");
              return;
            }

            // Handle specific error types - Quota errors with circuit breaker
            if (data?.error_type === "quota_exceeded" || data?.status === 429 || error.message?.includes("quota")) {
              const newQuotaErrorCount = quotaConsecutiveErrors + 1;
              setQuotaConsecutiveErrors(newQuotaErrorCount);

              console.error(`⚠️ API Quota Error (${newQuotaErrorCount}/${QUOTA_CIRCUIT_BREAKER_THRESHOLD})`);

              // Trigger circuit breaker after 3 consecutive quota errors
              if (newQuotaErrorCount >= QUOTA_CIRCUIT_BREAKER_THRESHOLD) {
                setQuotaErrorActive(true);
                const retryAt = Date.now() + QUOTA_PAUSE_DURATION;
                setQuotaCircuitBreakerRetryAt(retryAt);

                // Auto-pause recording
                if (isRecording) {
                  stopRecording();
                  console.log("🛑 Auto-paused recording due to quota exhaustion");
                }

                toast({
                  title: "🚫 API Quota Exhausted",
                  description: "Recording paused for 5 minutes. Check your OpenAI billing settings.",
                  variant: "destructive",
                  duration: 10000,
                });
              } else {
                // Show warning toast for first 2 errors
                toast({
                  title: "⚠️ API Quota Warning",
                  description: `Quota error ${newQuotaErrorCount}/${QUOTA_CIRCUIT_BREAKER_THRESHOLD}. Check your OpenAI billing.`,
                  variant: "destructive",
                  duration: 6000,
                });
              }

              setFailureCount((prev) => prev + 1);
              return;
            }

            // Reset quota error count on successful transcription or non-quota errors
            if (quotaConsecutiveErrors > 0) {
              setQuotaConsecutiveErrors(0);
            }

            if (data?.error_type === "invalid_api_key" || error.message?.includes("API key")) {
              toast({
                title: "API Configuration Error",
                description: "OpenAI API key is invalid. Please check your configuration.",
                variant: "destructive",
                duration: 8000,
              });
              return;
            }

            // Timeout errors
            if (data?.status === 408 || error.message?.includes("timeout")) {
              console.log("⏱️ Transcription timeout, will retry on next chunk");
              return;
            }

            // Only show generic error for critical errors, not for empty responses
            if (error.message && !error.message.includes("too small")) {
              const errorDesc = data?.error || error.message || "Please ensure your microphone is working properly.";
              toast({
                title: "Transcription error",
                description: errorDesc,
                variant: "destructive",
              });
            }
            return;
          }

          if (data?.text && data.text.trim()) {
            // Reset quota error count on successful transcription
            if (quotaConsecutiveErrors > 0) {
              setQuotaConsecutiveErrors(0);
            }

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

            // Hard cap to prevent runaway transcript growth
            const MAX_TRANSCRIPT_LENGTH = autoQuestionInterval * 200; // 200 words per minute max
            const currentWords = intervalTranscriptRef.current.split(/\s+/);

            if (currentWords.length > MAX_TRANSCRIPT_LENGTH) {
              // Force trim to most recent content
              const trimmedWords = currentWords.slice(-Math.floor(MAX_TRANSCRIPT_LENGTH * 0.75));
              intervalTranscriptRef.current = trimmedWords.join(" ");
              console.log(
                `⚠️ Transcript exceeded max length, trimmed from ${currentWords.length} to ${trimmedWords.length} words`,
              );
            }

            // Update interval transcript length state for UI
            setIntervalTranscriptLength(intervalTranscriptRef.current.length);

            // Calculate and update quality score for UI display with ACTUAL elapsed time
            try {
              const actualElapsedSeconds =
                intervalStartTimeRef.current > 0
                  ? Math.max(1, (Date.now() - intervalStartTimeRef.current) / 1000)
                  : autoQuestionInterval * 60;

              // Use sliding window for long transcripts
              const expectedWords = autoQuestionInterval * 150;
              const currentWordCount = intervalTranscriptRef.current.split(/\s+/).length;
              let transcriptToAnalyze = intervalTranscriptRef.current;

              if (currentWordCount > expectedWords * 2) {
                const words = intervalTranscriptRef.current.split(/\s+/);
                const recentWords = words.slice(-expectedWords);
                transcriptToAnalyze = recentWords.join(" ");
              }

              const qualityMetrics = analyzeContentQuality(transcriptToAnalyze, actualElapsedSeconds);
              setContentQualityScore(qualityMetrics.contentDensity);

              console.log("📊 Quality updated:", {
                transcriptLength: intervalTranscriptRef.current.length,
                wordCount: qualityMetrics.wordCount,
                density: (qualityMetrics.contentDensity * 100).toFixed(1) + "%",
                isQuality: qualityMetrics.isQualityContent,
                wpm: qualityMetrics.wordsPerMinute.toFixed(0),
                actualElapsedSeconds: actualElapsedSeconds.toFixed(0),
              });
            } catch (qualityError) {
              console.error("❌ Quality calculation error:", qualityError);
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
      const orgId = await getOrgId(user.id);
      const { error: insertError } = await supabase.from("lecture_questions").insert([
        {
          instructor_id: user.id,
          org_id: orgId,
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

  // Handle manual resume from quota error
  const handleResumeFromQuotaError = () => {
    setQuotaErrorActive(false);
    setQuotaCircuitBreakerRetryAt(0);
    setQuotaCircuitBreakerCountdown(0);
    setQuotaConsecutiveErrors(0);
    toast({
      title: "Ready to Resume",
      description: "You can now start recording again",
    });
  };

  // Error history management
  const addError = (
    severity: ErrorRecord["severity"],
    category: ErrorRecord["category"],
    message: string,
    details?: string,
    retryable?: boolean,
  ) => {
    const error: ErrorRecord = {
      id: `error-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      severity,
      category,
      message,
      details,
      retryable,
    };

    setErrorHistory((prev) => [error, ...prev].slice(0, 50)); // Keep last 50 errors
  };

  const handleDismissError = (errorId: string) => {
    setErrorHistory((prev) => prev.filter((e) => e.id !== errorId));
  };

  const handleClearAllErrors = () => {
    setErrorHistory([]);
  };

  // Handle extraction dialog actions
  const handleRetryExtraction = () => {
    setShowExtractionDialog(false);
    setPartialQuestion("");
    setEditedQuestion("");
    // Voice command will automatically retry on next detection
  };

  const handleManualSend = async () => {
    const questionToSend = editedQuestion.trim();
    if (!questionToSend) {
      toast({
        title: "Invalid Question",
        description: "Please enter a question to send",
        variant: "destructive",
      });
      return;
    }

    setShowExtractionDialog(false);

    // Send the manually edited question
    await handleQuestionSend({
      question_text: questionToSend,
      suggested_type: "multiple_choice",
      confidence: 1.0,
      extraction_method: "manual_edit",
      source: "voice_command_corrected",
    });

    setPartialQuestion("");
    setEditedQuestion("");
  };

  return (
    <>
      {/* Persistent Quota Error Alert Banner */}
      {quotaErrorActive && (
        <Card className="mb-4 border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-destructive mb-1">🚫 API Quota Exhausted - Recording Paused</h3>
                  <p className="text-sm text-muted-foreground">
                    OpenAI API quota has been exceeded after {QUOTA_CIRCUIT_BREAKER_THRESHOLD} consecutive errors.
                    Recording has been automatically paused to prevent further failures.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {quotaCircuitBreakerCountdown > 60
                        ? `${Math.ceil(quotaCircuitBreakerCountdown / 60)} min ${quotaCircuitBreakerCountdown % 60}s remaining`
                        : `${quotaCircuitBreakerCountdown}s remaining`}
                    </span>
                  </div>
                  <Progress
                    value={100 - (quotaCircuitBreakerCountdown / (QUOTA_PAUSE_DURATION / 1000)) * 100}
                    className="flex-1 h-2"
                  />
                </div>

                <div className="pt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <strong>What to do:</strong>
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                    <li>• Check your OpenAI billing settings and add credits if needed</li>
                    <li>• Wait for the automatic retry timer to complete</li>
                    <li>• Or manually resume recording once you've resolved the quota issue</li>
                  </ul>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleResumeFromQuotaError} variant="outline" size="sm" className="text-xs">
                      Resume Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Live Lecture Capture
          </CardTitle>
          <CardDescription>Record your lecture and send questions to students in real-time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Error History Panel */}
          {errorHistory.length > 0 && (
            <ErrorHistoryPanel errors={errorHistory} onDismiss={handleDismissError} onClearAll={handleClearAllErrors} />
          )}

          {/* System Status Monitoring Dashboard */}
          {isRecording && (
            <Card className="mb-4 border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">📊 System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    <p className="text-sm font-bold">{systemHealthy ? "✅ Active" : "❌ Error"}</p>
                  </div>

                  {/* Question Detection Status */}
                  <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Radio className="h-3 w-3 text-primary animate-pulse" />
                      <p className="text-xs font-medium text-muted-foreground">Detection</p>
                    </div>
                    <p className="text-sm font-bold">{isSendingQuestion ? "🔄 Sending" : "👂 Listening"}</p>
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

                  {/* Next Question with Progress Bar */}
                  <div className="flex flex-col p-3 bg-muted/50 rounded-lg border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Next Question</p>
                    <p className="text-sm font-bold mb-2">
                      {rateLimitSecondsLeft > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">⏱️ {rateLimitSecondsLeft}s</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">✅ Ready</span>
                      )}
                    </p>
                    {rateLimitSecondsLeft > 0 && (
                      <Progress
                        value={100 - (rateLimitSecondsLeft / 15) * 100}
                        className="h-2 bg-amber-100 dark:bg-amber-950"
                      />
                    )}
                  </div>
                </div>

                {/* Auto-Question Monitor */}
                {autoQuestionEnabled && (
                  <div className="mt-3">
                    <AutoQuestionDebugDashboard
                      isEnabled={autoQuestionEnabled}
                      isRecording={isRecording}
                      nextQuestionIn={nextAutoQuestionIn}
                      intervalMinutes={autoQuestionInterval}
                      isSendingQuestion={isSendingQuestion}
                      onTestNow={handleTestAutoQuestion}
                      onToggleEnabled={handleToggleAutoQuestion}
                    />
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
                  ? "🎙️ Real-time streaming active • Say 'send question now' or click 'Send Question' to send your most recent question to students"
                  : "Start recording with Deepgram real-time transcription - use voice commands or the 'Send Question' button to send questions"}
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
                  {(isRecording || transcriptChunks.length > 0) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm">
                          <Monitor className="h-4 w-4 mr-2" />
                          Presenter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            window.open(
                              '/instructor/lecture-presenter',
                              'lecture-presenter-full',
                              'width=450,height=750,menubar=no,toolbar=no,location=no,status=no'
                            );
                          }}
                        >
                          📊 Full View (Stats + History)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            window.open(
                              '/instructor/lecture-presenter?mini=true',
                              'lecture-presenter-mini',
                              'width=320,height=200,menubar=no,toolbar=no,location=no,status=no'
                            );
                          }}
                        >
                          ⏱️ Mini Timer (Compact)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                      <>⏱️ Wait {rateLimitSecondsLeft}s</>
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
                      Streaming
                    </Badge>
                    <Badge variant="secondary" className="flex-1 justify-center py-1.5">
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                    </Badge>
                  </div>

                  {/* Rate limit indicator */}
                  {rateLimitSecondsLeft > 0 && (
                    <Badge
                      variant="default"
                      className="w-full justify-center py-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    >
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Transcript Chunks:</p>
                    {/* Transcription Quality Rating */}
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Accuracy:</p>
                      {["excellent", "good", "poor"].map((rating) => (
                        <Button
                          key={rating}
                          variant={transcriptionRating === rating ? "default" : "outline"}
                          size="sm"
                          onClick={async () => {
                            try {
                              const {
                                data: { user },
                              } = await supabase.auth.getUser();
                              if (!user) return;

                              const { error } = await supabase.from("ai_quality_ratings").insert({
                                user_id: user.id,
                                rating_type: "transcription",
                                reference_id: sessionId,
                                rating: rating,
                              });

                              if (error) throw error;

                              setTranscriptionRating(rating);
                              toast({
                                title: "Thank you for your feedback!",
                                description: "Your rating helps us improve transcription quality.",
                              });
                            } catch (error) {
                              console.error("Error saving rating:", error);
                              toast({
                                title: "Failed to save rating",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="gap-1 h-7 text-xs"
                        >
                          <Star className={`h-3 w-3 ${transcriptionRating === rating ? "fill-current" : ""}`} />
                          {rating.charAt(0).toUpperCase() + rating.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transcriptChunks.map((chunk, index) => (
                      <div key={index} className="border rounded-lg p-2.5 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Chunk {index + 1}</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{chunk}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Extraction Error Dialog */}
      <AlertDialog open={showExtractionDialog} onOpenChange={setShowExtractionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Question Extraction Incomplete</AlertDialogTitle>
            <AlertDialogDescription>
              The voice command detected a partial question. You can edit it and send, or retry the extraction.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">Detected (partial):</p>
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">"{partialQuestion}"</p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Edit and send:</p>
              <Textarea
                value={editedQuestion}
                onChange={(e) => setEditedQuestion(e.target.value)}
                placeholder="Complete the question..."
                rows={3}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRetryExtraction}>Retry Extraction</AlertDialogCancel>
            <AlertDialogAction onClick={handleManualSend}>Send Question</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
