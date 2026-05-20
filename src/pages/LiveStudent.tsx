import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Zap } from "lucide-react";
import { useAnnouncer } from "@/components/accessibility";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceSelector, ConfidenceLevel } from "@/components/student/ConfidenceSelector";
import { AnimatedXPDisplay } from "@/components/student/AnimatedXPDisplay";
import { AIGradeDisplay } from "@/components/student/AIGradeDisplay";
import ReactMarkdown from "react-markdown";
import { MathRenderer } from "@/components/ui/math-renderer";
import { submitWithOfflineSupport } from "@/lib/offlineSubmit";
import { CodeEditor } from "@/components/ui/code-editor";
import { trackQuestionAnswered } from "@/lib/posthogTracking";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Question {
  id: string;
  question_content: {
    question: string;
    options: string[];
    correctAnswer: string;
    type: string;
    language?: string; // For coding questions
  };
  sent_at: string;
}

const BASE_REWARD = 10; // Base XP for live questions

const LiveStudent = () => {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const { announce } = useAnnouncer();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [codeAnswer, setCodeAnswer] = useState<string>("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const answeredQuestionsRef = useRef<Set<string>>(new Set());
  const currentQuestionIdRef = useRef<string | null>(null);
  const hasStartedAnsweringRef = useRef(false);
  
  // Confidence betting state
  const [showConfidenceSelector, setShowConfidenceSelector] = useState(false);
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel | null>(null);
  const [confidenceMultiplier, setConfidenceMultiplier] = useState<number>(1);
  const [pointsEarned, setPointsEarned] = useState<number>(0);
  
  // Session XP tracker
  const [sessionTotalXP, setSessionTotalXP] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [showXPPulse, setShowXPPulse] = useState(false);

  // AI Explanation state
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string>("");
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  // Keep refs in sync with state
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    currentQuestionIdRef.current = currentQuestion?.id || null;
  }, [currentQuestion]);

  useEffect(() => {
    if (selectedAnswer && selectedAnswer.length > 0) {
      hasStartedAnsweringRef.current = true;
    }
  }, [selectedAnswer]);

  // Reset "started answering" flag when question changes
  useEffect(() => {
    hasStartedAnsweringRef.current = false;
    setShowConfidenceSelector(false);
    setConfidenceLevel(null);
    setConfidenceMultiplier(1);
    setPointsEarned(0);
    setGradePending(false); // Reset pending state
    // Reset explanation state
    setShowExplanation(false);
    setExplanation("");
    // A11y: announce new question to screen readers (assertive — replaces prior)
    if (currentQuestion?.question_content?.question) {
      const qType = currentQuestion.question_content.type === "multiple_choice"
        ? "Multiple choice question"
        : currentQuestion.question_content.type === "short_answer"
          ? "Short answer question"
          : "Coding question";
      announce(`New ${qType}: ${currentQuestion.question_content.question}`, "assertive");
    }
  }, [currentQuestion?.id]);

  // A11y: announce grading result
  useEffect(() => {
    if (!hasAnswered) return;
    if (isCorrect === true) announce("Correct answer.", "assertive");
    else if (isCorrect === false) announce(`Incorrect. Correct answer was ${currentQuestion?.question_content?.correctAnswer ?? "shown above"}.`, "assertive");
    else announce("Answer submitted.", "polite");
  }, [hasAnswered, isCorrect]);

  // Session ID resolved from session_code for realtime subscription
  const [sessionId, setSessionId] = useState<string | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Normalize question_content: slide questions nest data inside questions[0]
  const normalizeQuestionContent = (qc: any): Question["question_content"] => {
    // If question_content has a nested questions array (slide/format-and-send format),
    // unwrap the first question and merge its fields to the top level
    if (qc?.questions && Array.isArray(qc.questions) && qc.questions.length > 0) {
      const inner = qc.questions[0];
      return {
        question: inner.question || inner.title || "",
        options: inner.options || [],
        correctAnswer: inner.correctAnswer || "",
        type: inner.type || "short_answer",
        language: inner.language,
      };
    }
    // Already flat format
    return qc;
  };

  // Shared logic for processing an incoming question (used by both realtime and polling)
  const processIncomingQuestion = useCallback((question: Question) => {
    const isNewQuestion = currentQuestionIdRef.current !== question.id;
    const hasBeenAnswered = answeredQuestionsRef.current.has(question.id);
    const userIsInteracting = hasStartedAnsweringRef.current || isTypingRef.current;

    if (isNewQuestion && !hasBeenAnswered && !userIsInteracting) {
      // Normalize nested question_content (from slide presenter / format-and-send)
      const normalized: Question = {
        ...question,
        question_content: normalizeQuestionContent(question.question_content),
      };
      setCurrentQuestion(normalized);
      setSelectedAnswer("");
      setCodeAnswer("");
      setHasAnswered(false);
      setIsCorrect(null);
      setQuestionStartTime(Date.now());
    }
  }, []);

  // On mount: validate participant, resolve session_id, fetch initial questions
  useEffect(() => {
    const storedParticipantId = localStorage.getItem("participantId");
    const storedNickname = localStorage.getItem("participantNickname");

    if (!storedParticipantId) {
      toast.error("Please join the session first");
      navigate("/join");
      return;
    }

    setParticipantId(storedParticipantId);
    setNickname(storedNickname || "");

    if (!sessionCode) return;

    // Resolve session_code to session_id via edge function (bypasses RLS for anonymous users)
    const initSession = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-live-session", {
          body: { sessionCode },
        });

        if (error || !data?.session) {
          const errMsg = data?.error || "Session not found";
          toast.error(errMsg, {
            description: "Check the code and try again.",
          });
          navigate("/join");
          return;
        }

        if (!data.session.is_active) {
          toast.error("Session ended", {
            description: "The live session has ended or is no longer active.",
          });
          navigate("/join");
          return;
        }

        setSessionId(data.session.id);

        // Process any existing questions
        if (data.questions && data.questions.length > 0) {
          const latestQuestion = data.questions[0] as unknown as Question;
          processIncomingQuestion(latestQuestion);
        }
      } catch (err) {
        console.error("Error initializing session:", err);
        toast.error("Failed to connect to session");
        navigate("/join");
      }
    };

    initSession();
  }, [sessionCode, navigate, processIncomingQuestion]);

  // Subscribe to realtime INSERT events on live_questions for this session
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`live-questions-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_questions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newQuestion = payload.new as unknown as Question;
          processIncomingQuestion(newQuestion);
        }
      )
      .subscribe((status) => {
        console.log(`Live questions realtime subscription: ${status}`);
      });

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [sessionId, processIncomingQuestion]);

  // Fallback polling at reduced frequency (10s) in case realtime drops
  useEffect(() => {
    if (!sessionId || !sessionCode) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-live-session", {
          body: { sessionCode },
        });

        if (!error && data?.questions?.length > 0) {
          processIncomingQuestion(data.questions[0] as unknown as Question);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [sessionId, sessionCode, processIncomingQuestion]);

  // Handle MCQ answer selection - show confidence selector
  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
    // For MCQ, show confidence selector after selecting answer
    if (currentQuestion?.question_content.type === "multiple_choice") {
      setShowConfidenceSelector(true);
    }
  };

  // Handle confidence selection and submit
  const handleConfidenceSelect = (level: ConfidenceLevel, multiplier: number) => {
    setConfidenceLevel(level);
    setConfidenceMultiplier(multiplier);
    // Auto-submit after confidence is locked
    handleSubmitWithConfidence(level, multiplier);
  };

  // Extract just the letter from MCQ answer for reliable server-side comparison
  // NOTE: Removed dangerous first-char fallback that misinterpreted words like "Bones" as "B"
  const extractMCQLetter = (answer: string): string => {
    const trimmed = answer.trim();
    // If already just a letter, return it
    if (/^[A-Da-d]$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    // Extract letter from explicit prefix formats: "B) 206 bones", "B. Answer", "B - text"
    const letterMatch = trimmed.match(/^([A-Da-d])[\).\-\s]/);
    if (letterMatch) {
      return letterMatch[1].toUpperCase();
    }
    // Match against current question options to find the letter
    if (currentQuestion?.question_content?.options) {
      const options = currentQuestion.question_content.options as string[];
      const letters = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < options.length && i < 4; i++) {
        const optText = options[i].replace(/^[A-Da-d][\).\-\s]+\s*/i, '').trim();
        if (trimmed.toLowerCase() === options[i].toLowerCase() || 
            trimmed.toLowerCase() === optText.toLowerCase()) {
          return letters[i];
        }
      }
    }
    return trimmed; // Return original if no pattern matches
  };

  const handleSubmitWithConfidence = async (level: ConfidenceLevel, multiplier: number) => {
    if (!selectedAnswer || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - questionStartTime;

    // For MCQ, extract just the letter for reliable grading
    const isMCQ = currentQuestion.question_content.type === 'multiple_choice';
    const normalizedAnswer = isMCQ ? extractMCQLetter(selectedAnswer) : selectedAnswer;

    const responseData = {
      questionId: currentQuestion.id,
      participantId,
      answer: normalizedAnswer,
      responseTimeMs,
      confidenceLevel: level,
      confidenceMultiplier: multiplier,
      baseReward: BASE_REWARD,
    };

    try {
      const result = await submitWithOfflineSupport(
        'submit-live-response',
        async () => {
          const { data, error } = await supabase.functions.invoke("submit-live-response", {
            body: responseData,
          });
          if (error) throw error;
          return data;
        },
        responseData
      );

      // Mark this question as answered to prevent re-prompting
      answeredQuestionsRef.current.add(currentQuestion.id);
      // Reset interaction flag to allow new questions to load
      hasStartedAnsweringRef.current = false;
      
      if (result.queued) {
        // Optimistic UI for offline submission
        setHasAnswered(true);
        setShowAccountPrompt(true);
        toast.info("Answer saved! Will sync when back online.", {
          icon: "📡",
        });
      } else if (result.success && result.data) {
        // Edge function returns { success, response: { isCorrect, pointsEarned, ... } }
        const responseData = result.data.response || result.data;
        setHasAnswered(true);
        setIsCorrect(responseData.isCorrect);
        setPointsEarned(responseData.pointsEarned || 0);
        const earned = responseData.pointsEarned || 0;
        setSessionTotalXP(prev => prev + earned);
        setQuestionsAnswered(prev => prev + 1);
        if (earned !== 0) {
          setShowXPPulse(true);
          setTimeout(() => setShowXPPulse(false), 1500);
        }
        setShowAccountPrompt(true);
        
        // Track question answered in PostHog
        trackQuestionAnswered(
          currentQuestion.question_content.type || 'multiple_choice',
          responseTimeMs
        );
        
        if (responseData.isCorrect) {
          toast.success(`Correct! +${responseData.pointsEarned} XP 🎉`);
        } else {
          const penalty = responseData.pointsEarned < 0 ? ` ${responseData.pointsEarned} XP` : '';
          toast.error(`Incorrect${penalty}`);
        }
      } else if (result.error) {
        throw result.error;
      }
    } catch (error: any) {
      console.error("Error submitting answer:", error);
      
      // Handle 409 "already submitted" from edge function
      let errorBody: string | null = null;
      try {
        // FunctionsHttpError stores the Response in error.context
        if (error?.context?.json) {
          const body = await error.context.json();
          errorBody = body?.error || '';
        }
      } catch { /* ignore parse errors */ }
      
      const isAlreadySubmitted = 
        error.message?.includes("Already answered") || 
        error.message?.includes("already submitted") ||
        errorBody?.includes("already submitted") ||
        errorBody?.includes("Already answered");
      
      if (isAlreadySubmitted) {
        toast.info("You already answered this question");
        answeredQuestionsRef.current.add(currentQuestion.id);
        setHasAnswered(true);
      } else {
        toast.error("Failed to submit answer");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load AI explanation on demand
  const loadAiExplanation = async () => {
    if (!currentQuestion || loadingExplanation) return;
    
    // Toggle off if already showing
    if (showExplanation && explanation) {
      setShowExplanation(false);
      return;
    }
    
    setLoadingExplanation(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-detailed-explanation', {
        body: {
          problemText: currentQuestion.question_content.question,
          correctAnswer: currentQuestion.question_content.correctAnswer,
          userAnswer: selectedAnswer,
          wasCorrect: isCorrect === true,
          courseContext: null
        }
      });
      
      if (error) throw error;
      
      setExplanation(data.explanation || "");
      setShowExplanation(true);
      
      toast.success(data.cached ? "⚡ Instant explanation loaded!" : "✨ AI explanation generated!");
    } catch (error) {
      console.error('Error loading explanation:', error);
      toast.error('Failed to load explanation');
    } finally {
      setLoadingExplanation(false);
    }
  };

  // AI grade state for short answers and coding
  const [aiGrade, setAiGrade] = useState<number | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiGradeComponents, setAiGradeComponents] = useState<any>(null);
  const [understandsConcept, setUnderstandsConcept] = useState<boolean | null>(null);
  const [gradePending, setGradePending] = useState<boolean>(false);
  const [isGrading, setIsGrading] = useState<boolean>(false); // Track grading in progress

  // For short answer questions (with AI grading)
  const handleSubmit = async () => {
    if (!selectedAnswer || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
    setIsGrading(true);
    
    // Show loading toast for auto-grading
    const gradingToastId = toast.loading("Auto-grading in progress...", {
      description: "AI is analyzing your answer",
    });
    const responseTimeMs = Date.now() - questionStartTime;

    const responseData = {
      questionId: currentQuestion.id,
      participantId,
      answer: selectedAnswer,
      responseTimeMs,
    };

    try {
      const result = await submitWithOfflineSupport(
        'submit-live-response',
        async () => {
          const { data, error } = await supabase.functions.invoke("submit-live-response", {
            body: responseData,
          });
          if (error) throw error;
          return data;
        },
        responseData
      );

      // Mark this question as answered to prevent re-prompting
      answeredQuestionsRef.current.add(currentQuestion.id);
      // Reset interaction flag to allow new questions to load
      hasStartedAnsweringRef.current = false;

      if (result.queued) {
        // Optimistic UI for offline submission
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        setHasAnswered(true);
        setShowAccountPrompt(true);
        toast.info("Answer saved! Will sync when back online.", {
          icon: "📡",
        });
      } else if (result.success && result.data) {
        // Edge function returns { success, response: { isCorrect, pointsEarned, ... } }
        const responseData = result.data.response || result.data;
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        setHasAnswered(true);
        setIsCorrect(responseData.isCorrect);
        setAiGrade(responseData.aiGrade || null);
        setAiFeedback(responseData.aiFeedback || null);
        setAiGradeComponents(responseData.gradeBreakdown?.components || null);
        setGradePending(responseData.gradePending || false);
        setShowAccountPrompt(true);
        
        // Track question answered in PostHog
        trackQuestionAnswered(
          currentQuestion.question_content.type || 'short_answer',
          responseTimeMs
        );
        
        // Show appropriate feedback based on grading mode
        if (responseData.gradePending) {
          toast.info("Answer submitted! Your instructor will review it soon. ⏱️");
        } else if (responseData.aiGrade !== null) {
          const gradeText = `${responseData.aiGrade}%`;
          if (responseData.aiGrade >= 70) {
            toast.success(`Great work! Score: ${gradeText} 🎉`);
          } else if (responseData.aiGrade >= 50) {
            toast.info(`Score: ${gradeText} - Good effort!`);
          } else {
            toast.error(`Score: ${gradeText} - Keep practicing!`);
          }
        }
      } else if (result.error) {
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        throw result.error;
      }
    } catch (error: any) {
      toast.dismiss(gradingToastId);
      setIsGrading(false);
      console.error("Error submitting answer:", error);
      if (error.message?.includes("Already answered")) {
        toast.info("You already answered this question");
        answeredQuestionsRef.current.add(currentQuestion.id);
        setHasAnswered(true);
      } else {
        toast.error("Failed to submit answer");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // For coding questions (with AI concept-focused grading)
  const handleCodingSubmit = async () => {
    if (!codeAnswer.trim() || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
    setIsGrading(true);
    
    // Show loading toast for auto-grading
    const gradingToastId = toast.loading("Auto-grading in progress...", {
      description: "AI is analyzing your code",
    });
    
    const responseTimeMs = Date.now() - questionStartTime;

    const responseData = {
      questionId: currentQuestion.id,
      participantId,
      answer: codeAnswer,
      responseTimeMs,
      // Coding questions don't use confidence betting (too complex)
      confidenceLevel: null,
      confidenceMultiplier: 1,
      baseReward: BASE_REWARD,
    };

    try {
      const result = await submitWithOfflineSupport(
        'submit-live-response',
        async () => {
          const { data, error } = await supabase.functions.invoke("submit-live-response", {
            body: responseData,
          });
          if (error) throw error;
          return data;
        },
        responseData
      );

      // Mark this question as answered to prevent re-prompting
      answeredQuestionsRef.current.add(currentQuestion.id);
      // Reset interaction flag to allow new questions to load
      hasStartedAnsweringRef.current = false;

      if (result.queued) {
        // Optimistic UI for offline submission
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        setHasAnswered(true);
        setShowAccountPrompt(true);
        toast.info("Code saved! Will sync when back online.", {
          icon: "📡",
        });
      } else if (result.success && result.data) {
        // Edge function returns { success, response: { isCorrect, pointsEarned, ... } }
        const responseData = result.data.response || result.data;
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        setHasAnswered(true);
        setIsCorrect(responseData.isCorrect);
        setAiGrade(responseData.aiGrade || null);
        setAiFeedback(responseData.aiFeedback || null);
        setAiGradeComponents(responseData.gradeBreakdown?.components || null);
        setUnderstandsConcept(responseData.gradeBreakdown?.understandsConcept ?? null);
        setPointsEarned(responseData.pointsEarned || 0);
        const earned = responseData.pointsEarned || 0;
        setSessionTotalXP(prev => prev + earned);
        setQuestionsAnswered(prev => prev + 1);
        if (earned !== 0) {
          setShowXPPulse(true);
          setTimeout(() => setShowXPPulse(false), 1500);
        }
        setShowAccountPrompt(true);
        
        // Track question answered in PostHog
        trackQuestionAnswered(
          currentQuestion.question_content.type || 'coding',
          responseTimeMs
        );
        
        if (responseData.aiGrade !== null) {
          const gradeText = `${responseData.aiGrade}%`;
          if (responseData.aiGrade >= 70) {
            toast.success(`Great work! Score: ${gradeText} 🎉`);
          } else if (responseData.aiGrade >= 50) {
            toast.info(`Score: ${gradeText} - Good effort!`);
          } else {
            toast.error(`Score: ${gradeText} - Keep practicing!`);
          }
        }
      } else if (result.error) {
        toast.dismiss(gradingToastId);
        setIsGrading(false);
        throw result.error;
      }
    } catch (error: any) {
      toast.dismiss(gradingToastId);
      setIsGrading(false);
      console.error("Error submitting code:", error);
      if (error.message?.includes("Already answered")) {
        toast.info("You already submitted code for this question");
        answeredQuestionsRef.current.add(currentQuestion.id);
        setHasAnswered(true);
      } else {
        toast.error("Failed to submit code. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold">Welcome, {nickname}!</p>
              <p className="text-muted-foreground">Waiting for the instructor to send a question...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Safeguard: ensure question_content exists before rendering
  if (!currentQuestion?.question_content) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading question...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMCQ = currentQuestion.question_content.type === "multiple_choice";

  return (
    <main id="main-content" aria-label="Live session question" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 relative">
      {/* Session XP Tracker - Fixed top right */}
      {questionsAnswered > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`Session score: ${sessionTotalXP} XP, ${questionsAnswered} question${questionsAnswered !== 1 ? 's' : ''} answered`}
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border shadow-lg motion-safe:transition-all motion-safe:duration-300 ${showXPPulse ? 'motion-safe:scale-110 ring-2 ring-primary/50' : 'scale-100'}`}
        >
          <div className="flex items-center gap-1.5">
            <Zap className="w-5 h-5 text-primary fill-primary" aria-hidden="true" />
            <span className="text-lg font-bold text-foreground">
              {sessionTotalXP > 0 ? '+' : ''}{sessionTotalXP}
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">XP</span>
          </div>
          <div className="w-px h-5 bg-border" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">
            {questionsAnswered} Q{questionsAnswered !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="w-full max-w-2xl space-y-4">
        {showAccountPrompt && (
          <Card className="bg-gradient-to-r from-primary/20 to-secondary/20 border-2 border-primary">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-center md:text-left">
                <p className="font-semibold text-lg mb-1">Want to track your progress?</p>
                <p className="text-sm text-muted-foreground">Create an account to save your stats and compete on leaderboards</p>
              </div>
              <Button 
                onClick={() => navigate(`/auth?redirect=/live/${sessionCode}`)}
                className="shrink-0"
              >
                Create Account
              </Button>
            </CardContent>
          </Card>
        )}
      <Card key={currentQuestion.id} className="w-full animate-fade-in">
        <CardHeader>
          <CardTitle className="text-2xl">
            <MathRenderer content={currentQuestion.question_content.question} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasAnswered ? (
            <>
              {/* MCQ with confidence betting */}
              {isMCQ && currentQuestion.question_content.options && (
                <>
                  {!showConfidenceSelector ? (
                    <RadioGroup value={selectedAnswer} onValueChange={handleAnswerSelect}>
                      <div className="space-y-3">
                        {currentQuestion.question_content.options.map((option, index) => (
                          <div key={index} className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent transition-colors">
                            <RadioGroupItem value={option} id={`option-${index}`} />
                            <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer text-base">
                              <MathRenderer content={option} />
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Your answer:</p>
                        <p className="font-medium">{selectedAnswer}</p>
                      </div>
                      <ConfidenceSelector 
                        baseReward={BASE_REWARD}
                        onSelect={handleConfidenceSelect}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Short answer (no confidence betting) */}
              {currentQuestion.question_content.type === "short_answer" && (
                <>
                  <Textarea
                    value={selectedAnswer}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    placeholder="Type your answer here..."
                    className="min-h-[120px]"
                  />
                  <Button 
                    onClick={handleSubmit} 
                    className="w-full" 
                    size="lg"
                    disabled={!selectedAnswer || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Answer"
                    )}
                  </Button>
                </>
              )}

              {/* Coding question (both simple and full) */}
              {(currentQuestion.question_content.type === "coding" || 
                currentQuestion.question_content.type === "coding_simple") && (
                <>
                  <div className="space-y-3">
                    {currentQuestion.question_content.type === "coding_simple" && (
                      <div className="text-sm bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="text-lg">💡</span>
                          <div>
                            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                              Quick Concept Check-In
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              Show you understand the concept. Minor syntax errors won't hurt your grade! Focus on demonstrating the core idea.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {currentQuestion.question_content.type === "coding" && (
                      <div className="text-sm bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="text-lg">⚡</span>
                          <div>
                            <p className="font-medium text-purple-900 dark:text-purple-100 mb-1">
                              Full Coding Challenge
                            </p>
                            <p className="text-xs text-purple-700 dark:text-purple-300">
                              Write complete, working code. Your solution will be tested for correctness and efficiency.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Label className="text-sm font-medium">
                      Write your code in {currentQuestion.question_content.language || 'Python'}:
                    </Label>
                    
                    <CodeEditor
                      value={codeAnswer}
                      onChange={setCodeAnswer}
                      language={currentQuestion.question_content.language || 'python'}
                      placeholder={currentQuestion.question_content.type === "coding_simple" 
                        ? `# Quick check-in - show the core concept\n# Example: Write a for loop\n\n` 
                        : `# Write your complete solution here\n\n`}
                      height={currentQuestion.question_content.type === "coding_simple" ? "200px" : "300px"}
                      simpleMode={currentQuestion.question_content.type === "coding_simple"}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleCodingSubmit} 
                    className="w-full" 
                    size="lg"
                    disabled={!codeAnswer.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {currentQuestion.question_content.type === "coding_simple" 
                          ? "Checking your understanding..." 
                          : "Testing your code..."}
                      </>
                    ) : (
                      <>
                        {currentQuestion.question_content.type === "coding_simple" 
                          ? "Submit Check-In" 
                          : "Submit Solution"}
                      </>
                    )}
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="text-center space-y-6 py-8">
              {/* MCQ Results - Correct/Incorrect feedback */}
              {isMCQ && (
                <>
                  {isCorrect === true ? (
                    <>
                      <div className="relative">
                        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto animate-in zoom-in-50 duration-300" />
                      </div>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                        Correct! 🎉
                      </p>
                      <p className="text-muted-foreground">
                        Your answer: <span className="font-semibold text-green-600 dark:text-green-400">{selectedAnswer}</span>
                      </p>
                    </>
                  ) : isCorrect === false ? (
                    <>
                      <div className="relative">
                        <XCircle className="h-16 w-16 text-red-500 mx-auto animate-in zoom-in-50 duration-300" />
                      </div>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                        Incorrect
                      </p>
                      <p className="text-muted-foreground">
                        Your answer: <span className="font-semibold text-red-600 dark:text-red-400">{selectedAnswer}</span>
                      </p>
                      {currentQuestion?.question_content?.correctAnswer && (
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 max-w-md mx-auto">
                          <p className="text-sm text-green-800 dark:text-green-200">
                            <span className="font-medium">Correct answer:</span>{" "}
                            {currentQuestion.question_content.correctAnswer}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <CheckCircle2 className="h-16 w-16 text-blue-500 mx-auto animate-in zoom-in-50 duration-300" />
                      </div>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                        Response Recorded ✓
                      </p>
                      <p className="text-muted-foreground">
                        Your answer: <span className="font-semibold">{selectedAnswer}</span>
                      </p>
                    </>
                  )}
                  {pointsEarned !== 0 && (
                    <AnimatedXPDisplay 
                      points={pointsEarned}
                      multiplier={confidenceMultiplier}
                      isCorrect={isCorrect ?? false}
                    />
                  )}
                </>
              )}

              {/* Grading in Progress Skeleton */}
              {!isMCQ && isGrading && (
                <div className="max-w-lg mx-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                  <div className="p-6 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <span className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                        Auto-grading in progress...
                      </span>
                    </div>
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full bg-blue-200/50 dark:bg-blue-800/50" />
                      <Skeleton className="h-4 w-3/4 bg-blue-200/50 dark:bg-blue-800/50" />
                      <Skeleton className="h-4 w-1/2 bg-blue-200/50 dark:bg-blue-800/50" />
                    </div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
                      AI is analyzing your response...
                    </p>
                  </div>
                </div>
              )}

              {/* Short Answer and Coding Results with AI Grade */}
              {!isMCQ && !isGrading && aiGrade !== null && aiFeedback && (
                <div className="max-w-lg mx-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                  <AIGradeDisplay
                    grade={aiGrade}
                    feedback={aiFeedback}
                    components={aiGradeComponents}
                    questionType={currentQuestion.question_content.type as 'short_answer' | 'coding' | 'coding_simple'}
                    understandsConcept={understandsConcept ?? undefined}
                  />
                  {pointsEarned !== 0 && (
                    <div className="mt-4">
                      <AnimatedXPDisplay 
                        points={pointsEarned}
                        multiplier={confidenceMultiplier}
                        isCorrect={isCorrect ?? false}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Fallback for non-MCQ without AI grade - Show pending or submitted status */}
              {!isMCQ && !isGrading && aiGrade === null && (
                <>
                  {gradePending ? (
                    <>
                      <div className="relative">
                        <AlertCircle className="h-16 w-16 text-blue-500 mx-auto animate-in zoom-in-50 duration-300" />
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-2xl">⏱️</span>
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-blue-600 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                        Answer Submitted
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                        <p className="text-blue-800 font-medium mb-1">⏰ Awaiting Grade</p>
                        <p className="text-sm text-blue-600">
                          Your instructor will review your submission and provide feedback soon.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-16 w-16 text-primary mx-auto animate-in zoom-in-50 duration-300" />
                      <p className="text-2xl font-bold text-primary">Submitted!</p>
                      <p className="text-muted-foreground">Your answer has been recorded.</p>
                    </>
                  )}
                </>
              )}
              
              {/* AI Explanation Button */}
              <Button
                onClick={loadAiExplanation}
                variant="outline"
                className="w-full max-w-md mx-auto"
                disabled={loadingExplanation}
              >
                {loadingExplanation ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating explanation...
                  </>
                ) : showExplanation ? (
                  <>📚 Hide Explanation</>
                ) : (
                  <>✨ Why? Get AI Explanation</>
                )}
              </Button>
              
              {/* AI Explanation Display */}
              {showExplanation && explanation && (
                <div className="text-left p-4 bg-primary/5 rounded-lg border-2 border-primary/20 max-w-2xl mx-auto mt-4">
                  <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                    🎓 AI Explanation
                  </h4>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <MathRenderer content={explanation} />
                  </div>
                </div>
              )}
              
              <p className="text-lg text-muted-foreground mt-4">
                Waiting for next question...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default LiveStudent;
