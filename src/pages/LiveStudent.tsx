import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Question {
  id: string;
  question_content: {
    question: string;
    options: string[];
    correctAnswer: string;
    type: string;
  };
  sent_at: string;
}

const LiveStudent = () => {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
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
          setHasAnswered(false);
          setIsCorrect(null);
          setQuestionStartTime(Date.now());
        }
      }
    } catch (error) {
      console.error("Error polling for questions:", error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAnswer || !participantId || !currentQuestion) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - questionStartTime;

    try {
      const { data, error } = await supabase.functions.invoke("submit-live-response", {
        body: {
          questionId: currentQuestion.id,
          participantId,
          answer: selectedAnswer,
          responseTimeMs,
        },
      });

      if (error) throw error;

      // Mark this question as answered to prevent re-prompting
      answeredQuestionsRef.current.add(currentQuestion.id);
      
      setHasAnswered(true);
      setIsCorrect(data.isCorrect);
      setShowAccountPrompt(true);
      
      if (data.isCorrect) {
        toast.success("Correct! 🎉");
      } else {
        toast.error("Incorrect. Try again next time!");
      }
    } catch (error: any) {
      console.error("Error submitting answer:", error);
      if (error.message?.includes("Already answered")) {
        toast.info("You already answered this question");
        // Mark as answered even if backend says it was already answered
        answeredQuestionsRef.current.add(currentQuestion.id);
        setHasAnswered(true);
      } else {
        toast.error("Failed to submit answer");
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
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{currentQuestion.question_content.question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasAnswered ? (
            <>
              {currentQuestion.question_content.type === "multiple_choice" && currentQuestion.question_content.options && (
                <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
                  <div className="space-y-3">
                    {currentQuestion.question_content.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent transition-colors">
                        <RadioGroupItem value={option} id={`option-${index}`} />
                        <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer text-base">
                          {option}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}

              {currentQuestion.question_content.type === "short_answer" && (
                <Textarea
                  value={selectedAnswer}
                  onChange={(e) => setSelectedAnswer(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  placeholder="Type your answer here..."
                  className="min-h-[120px]"
                />
              )}
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
          ) : (
            <div className="text-center space-y-4 py-8">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <p className="text-2xl font-bold text-green-500">Correct!</p>
                </>
              ) : (
                <>
                  <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                  <p className="text-2xl font-bold text-red-500">Incorrect</p>
                  <p className="text-muted-foreground">
                    Correct answer: {currentQuestion.question_content.correctAnswer}
                  </p>
                </>
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