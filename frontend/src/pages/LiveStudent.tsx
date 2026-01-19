import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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
  }, [currentQuestion?.id]);

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

    // Start polling for questions
    const pollInterval = setInterval(() => {
      pollForQuestions();
    }, 3000);

    // Initial poll
    pollForQuestions();

    return () => clearInterval(pollInterval);
  }, [sessionCode, navigate]);

  const pollForQuestions = async () => {
    if (!sessionCode) return;

    try {
      const url = `https://otsmjgrhyteyvpufkwdh.supabase.co/functions/v1/get-live-question?sessionCode=${sessionCode}`;
      const response = await fetch(url, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90c21qZ3JoeXRleXZwdWZrd2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MTAwMjksImV4cCI6MjA2NTI4NjAyOX0.lECUFBdhoe2gxBJSvHSMlq1BGearE97kSOL-Pz8FZbw',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Session ended", {
            description: "The live session has ended or is no longer active.",
          });
          setTimeout(() => navigate("/join"), 2000);
        }
        return;
      }

      const result = await response.json();
      
      if (result.questions && result.questions.length > 0) {
        const latestQuestion = result.questions[0];
        
        // Use REFS instead of state (always current, no stale closure)
        const isNewQuestion = currentQuestionIdRef.current !== latestQuestion.id;
        const hasBeenAnswered = answeredQuestionsRef.current.has(latestQuestion.id);
        const userIsInteracting = hasStartedAnsweringRef.current || isTypingRef.current;
        
        // Only update if: 1) NEW question 2) Not answered 3) User not interacting
        if (isNewQuestion && !hasBeenAnswered && !userIsInteracting) {
          setCurrentQuestion(latestQuestion);
          setSelectedAnswer("");
          setCodeAnswer("");
          setHasAnswered(false);
          setIsCorrect(null);
          setQuestionStartTime(Date.now());
        }
      }
    } catch (error) {
      console.error("Error polling for questions:", error);
    }
  };

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

  const handleSubmitWithConfidence = async (level: ConfidenceLevel, multiplier: number) => {
    if (!selectedAnswer || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - questionStartTime;

    const responseData = {
      questionId: currentQuestion.id,
      participantId,
      answer: selectedAnswer,
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
        setHasAnswered(true);
        setIsCorrect(result.data.isCorrect);
        setPointsEarned(result.data.pointsEarned || 0);
        setShowAccountPrompt(true);
        
        if (result.data.isCorrect) {
          toast.success(`Correct! +${result.data.pointsEarned} XP 🎉`);
        } else {
          const penalty = result.data.pointsEarned < 0 ? ` ${result.data.pointsEarned} XP` : '';
          toast.error(`Incorrect${penalty}`);
        }
      } else if (result.error) {
        throw result.error;
      }
    } catch (error: any) {
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
          wasCorrect: isCorrect,
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
  const [gradePending, setGradePending] = useState<boolean>(false); // NEW: Track if grade is pending

  // For short answer questions (with AI grading)
  const handleSubmit = async () => {
    if (!selectedAnswer || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
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
        setHasAnswered(true);
        setShowAccountPrompt(true);
        toast.info("Answer saved! Will sync when back online.", {
          icon: "📡",
        });
      } else if (result.success && result.data) {
        setHasAnswered(true);
        setIsCorrect(result.data.isCorrect);
        setAiGrade(result.data.aiGrade || null);
        setAiFeedback(result.data.aiFeedback || null);
        setAiGradeComponents(result.data.gradeBreakdown?.components || null);
        setGradePending(result.data.gradePending || false); // NEW: Set pending state
        setShowAccountPrompt(true);
        
        // Show appropriate feedback based on grading mode
        if (result.data.gradePending) {
          toast.info("Answer submitted! Your instructor will review it soon. ⏱️");
        } else if (result.data.aiGrade !== null) {
          const gradeText = `${result.data.aiGrade}%`;
          if (result.data.aiGrade >= 70) {
            toast.success(`Great work! Score: ${gradeText} 🎉`);
          } else if (result.data.aiGrade >= 50) {
            toast.info(`Score: ${gradeText} - Good effort!`);
          } else {
            toast.error(`Score: ${gradeText} - Keep practicing!`);
          }
        }
      } else if (result.error) {
        throw result.error;
      }
    } catch (error: any) {
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
        setHasAnswered(true);
        setShowAccountPrompt(true);
        toast.info("Code saved! Will sync when back online.", {
          icon: "📡",
        });
      } else if (result.success && result.data) {
        setHasAnswered(true);
        setIsCorrect(result.data.isCorrect);
        setAiGrade(result.data.aiGrade || null);
        setAiFeedback(result.data.aiFeedback || null);
        setAiGradeComponents(result.data.gradeBreakdown?.components || null);
        setUnderstandsConcept(result.data.gradeBreakdown?.understandsConcept ?? null);
        setPointsEarned(result.data.pointsEarned || 0);
        setShowAccountPrompt(true);
        
        if (result.data.aiGrade !== null) {
          const gradeText = `${result.data.aiGrade}%`;
          if (result.data.aiGrade >= 70) {
            toast.success(`Great work! Score: ${gradeText} 🎉`);
          } else if (result.data.aiGrade >= 50) {
            toast.info(`Score: ${gradeText} - Good effort!`);
          } else {
            toast.error(`Score: ${gradeText} - Keep practicing!`);
          }
        }
      } else if (result.error) {
        throw result.error;
      }
    } catch (error: any) {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="w-full max-w-2xl space-y-4">
        {showAccountPrompt && (
          <Card className="bg-gradient-to-r from-primary/20 to-secondary/20 border-2 border-primary">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-center md:text-left">
                <p className="font-semibold text-lg mb-1">Want to track your progress?</p>
                <p className="text-sm text-muted-foreground">Create an account to save your stats and compete on leaderboards</p>
              </div>
              <Button 
                onClick={() => navigate("/auth")}
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
                  <div className="space-y-2">
                    {currentQuestion.question_content.type === "coding_simple" && (
                      <div className="text-xs text-muted-foreground bg-primary/5 p-2 rounded mb-2">
                        💡 Quick check-in: Show you understand the concept. Minor errors won't hurt your grade!
                      </div>
                    )}
                    <Label className="text-sm text-muted-foreground">
                      Write your code below ({currentQuestion.question_content.language || 'any language'}):
                    </Label>
                    <CodeEditor
                      value={codeAnswer}
                      onChange={setCodeAnswer}
                      language={currentQuestion.question_content.language || 'python'}
                      placeholder="// Write your solution here..."
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
                        Grading your code...
                      </>
                    ) : (
                      "Submit Code"
                    )}
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="text-center space-y-6 py-8">
              {/* MCQ Results */}
              {isMCQ && (
                <>
                  {isCorrect ? (
                    <>
                      <div className="relative">
                        <CheckCircle2 className="h-16 w-16 text-primary mx-auto animate-in zoom-in-50 duration-300" />
                      </div>
                      <p className="text-2xl font-bold text-primary animate-in fade-in-0 slide-in-from-bottom-2 duration-500">Correct!</p>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-16 w-16 text-destructive mx-auto animate-in zoom-in-50 duration-300" />
                      <p className="text-2xl font-bold text-destructive animate-in fade-in-0 slide-in-from-bottom-2 duration-500">Incorrect</p>
                      <p className="text-muted-foreground">
                        Correct answer: <MathRenderer content={currentQuestion.question_content.correctAnswer} />
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

              {/* Short Answer and Coding Results with AI Grade */}
              {!isMCQ && aiGrade !== null && aiFeedback && (
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
              {!isMCQ && aiGrade === null && (
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
