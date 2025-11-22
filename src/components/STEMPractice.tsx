import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfidenceSelector, ConfidenceLevel } from "@/components/student/ConfidenceSelector";

interface STEMPracticeProps {
  userId?: string;
  onPointsEarned?: (points: number) => void;
  courseContext?: {
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  };
}

interface STEMProblem {
  id: string;
  subject: string;
  difficulty: string;
  problem_text: string;
  options: string[];
  correct_answer?: string; // Optional - only available after submission
  explanation?: string; // Optional - only available after submission
  wrong_answer_explanations?: Record<string, string>; // Explanations for incorrect answers
  points_reward: number;
}

export default function STEMPractice({ userId, onPointsEarned, courseContext }: STEMPracticeProps) {
  const [currentProblem, setCurrentProblem] = useState<STEMProblem | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problemsToday, setProblemsToday] = useState(0);
  const [streak, setStreak] = useState(0);
  const [courseQuestions, setCourseQuestions] = useState<STEMProblem[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [detailedExplanation, setDetailedExplanation] = useState<string>("");
  const [showDetailedExplanation, setShowDetailedExplanation] = useState(false);
  const [loadingDetailedExplanation, setLoadingDetailedExplanation] = useState(false);
  
  // Confidence gambling state
  const [showConfidenceSelector, setShowConfidenceSelector] = useState(false);
  const [selectedConfidence, setSelectedConfidence] = useState<{ level: ConfidenceLevel; multiplier: number } | null>(null);
  const [submissionStartTime, setSubmissionStartTime] = useState<number>(0);

  useEffect(() => {
    if (userId) {
      fetchDailyProgress();
      
      // If we have course context, generate course-specific questions
      if (courseContext?.courseTitle) {
        generateCourseQuestions();
      } else {
        loadNextProblem();
      }
    }
  }, [userId, courseContext?.courseTitle]);

  const fetchDailyProgress = async () => {
    if (!userId) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from("problem_attempts")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lte("created_at", `${today}T23:59:59.999Z`);
    
    if (!error && data) {
      setProblemsToday(data.length);
      
      // Calculate current streak
      const correctToday = data.filter(attempt => attempt.is_correct).length;
      setStreak(correctToday);
    }
  };

  const generateCourseQuestions = async () => {
    if (!courseContext?.courseTitle || generatingQuestions) return;
    
    setGeneratingQuestions(true);
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-course-questions', {
        body: {
          courseTitle: courseContext.courseTitle,
          courseTopics: courseContext.courseTopics || [],
          difficulty: 'intermediate'
        }
      });

      if (error) {
        console.error('Error generating course questions:', error);
        toast.error('Failed to generate course-specific questions. Loading general questions instead.');
        loadNextProblem();
        return;
      }

      if (data?.questions && data.questions.length > 0) {
        setCourseQuestions(data.questions);
        // Load the first question
        setCurrentProblem(data.questions[0]);
        setSelectedAnswer("");
        setShowResult(false);
        toast.success(`Generated ${data.questions.length} questions for ${courseContext.courseTitle}!`);
      } else {
        toast.error('No questions generated. Loading general questions.');
        loadNextProblem();
      }
    } catch (error) {
      console.error('Error generating questions:', error);
      toast.error('Failed to generate questions');
      loadNextProblem();
    } finally {
      setLoading(false);
      setGeneratingQuestions(false);
    }
  };

  const loadNextProblem = async () => {
    setLoading(true);
    try {
      // Priority 1: Course-specific questions
      if (courseQuestions.length > 0) {
        const nextQuestion = courseQuestions.find(q => q.id !== currentProblem?.id);
        if (nextQuestion) {
          setCurrentProblem(nextQuestion);
        } else {
          await generateCourseQuestions();
        }
        setSelectedAnswer("");
        setShowResult(false);
        setLoading(false);
        return;
      }

      // Priority 2: Personalized questions from user materials
      if (userId) {
        const { data: personalizedQuestions, error: pqError } = await supabase
          .from("personalized_questions")
          .select("*")
          .eq("user_id", userId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!pqError && personalizedQuestions && personalizedQuestions.length > 0) {
          // Pick a random personalized question
          const randomQuestion = personalizedQuestions[Math.floor(Math.random() * personalizedQuestions.length)];
          const problem: STEMProblem = {
            id: randomQuestion.id,
            subject: randomQuestion.topic_tags?.[0] || 'General',
            difficulty: randomQuestion.difficulty,
            problem_text: randomQuestion.question_text,
            options: randomQuestion.options as string[],
            correct_answer: randomQuestion.correct_answer,
            explanation: randomQuestion.explanation,
            points_reward: randomQuestion.points_reward,
          };
          setCurrentProblem(problem);
          setSelectedAnswer("");
          setShowResult(false);
          setLoading(false);
          return;
        }
      }

      // Priority 3: Spaced repetition review
      if (userId) {
        const today = new Date().toISOString().split('T')[0];
        const { data: dueProblems, error: srError } = await supabase
          .from("spaced_repetition")
          .select("problem_id")
          .eq("user_id", userId)
          .lte("next_review_date", today)
          .limit(5);

        if (!srError && dueProblems && dueProblems.length > 0) {
          const problemIds = dueProblems.map(p => p.problem_id);
          const { data: dueProblemsData } = await supabase
            .from("stem_problems_student_view")
            .select("*")
            .in("id", problemIds)
            .limit(1);

          if (dueProblemsData && dueProblemsData.length > 0) {
            const problemData = dueProblemsData[0];
            const problem: STEMProblem = {
              ...problemData,
              options: problemData.options as string[],
            };
            setCurrentProblem(problem);
            setSelectedAnswer("");
            setShowResult(false);
            setLoading(false);
            return;
          }
        }
      }

      // Fallback to general problems from stem_problems_student_view
      const { data: newProblems, error: newError } = await supabase
        .from("stem_problems_student_view")
        .select("*")
        .limit(20);
      
      if (!newError && newProblems && newProblems.length > 0) {
        const problemData = newProblems[Math.floor(Math.random() * newProblems.length)];
        const problem: STEMProblem = {
          ...problemData,
          options: problemData.options as string[],
        };
        setCurrentProblem(problem);
        setSelectedAnswer("");
        setShowResult(false);
        setLoading(false);
        return;
      }

      // Last resort: try student_problems view
      const { data: studentProblems } = await supabase
        .from("student_problems")
        .select("*")
        .limit(20);
      
      if (studentProblems && studentProblems.length > 0) {
        const problemData = studentProblems[Math.floor(Math.random() * studentProblems.length)];
        const problem: STEMProblem = {
          ...problemData,
          options: problemData.options as string[],
        };
        setCurrentProblem(problem);
      } else {
        console.error("Error loading problems:", newError);
        toast.error("No practice problems available at the moment");
      }

      setSelectedAnswer("");
      setShowResult(false);
    } catch (error) {
      console.error("Error loading problem:", error);
      toast.error("Error loading problem. Please try again.");
    }
    setLoading(false);
  };

  const handleAnswerSelected = () => {
    if (!selectedAnswer) return;
    setSubmissionStartTime(Date.now());
    setShowConfidenceSelector(true);
  };

  const handleConfidenceSelected = async (level: ConfidenceLevel, multiplier: number) => {
    setSelectedConfidence({ level, multiplier });
    await submitAnswerWithConfidence(level, multiplier);
  };

  const submitAnswerWithConfidence = async (confidenceLevel: ConfidenceLevel, multiplier: number) => {
    if (!currentProblem || !selectedAnswer || !userId) return;

    const timeSpent = Math.floor((Date.now() - submissionStartTime) / 1000);

    // For course-generated questions, we already have the answer
    if (currentProblem.correct_answer) {
      const correct = selectedAnswer === currentProblem.correct_answer;
      await processAnswer(correct, currentProblem.correct_answer, currentProblem.explanation, confidenceLevel, multiplier, timeSpent);
      return;
    }

    // Legacy flow for database problems
    await supabase
      .from("problem_attempts")
      .insert([{
        user_id: userId,
        problem_id: currentProblem.id,
        is_correct: false,
      }]);

    const { data: answerData } = await supabase
      .rpc('get_problem_answer', { problem_id: currentProblem.id });

    if (!answerData || answerData.length === 0) {
      toast.error("Failed to verify answer");
      return;
    }

    const { correct_answer, explanation } = answerData[0];
    const correct = selectedAnswer === correct_answer;
    
    setCurrentProblem({
      ...currentProblem,
      correct_answer,
      explanation,
    });

    await processAnswer(correct, correct_answer, explanation, confidenceLevel, multiplier, timeSpent);
  };

  const processAnswer = async (
    correct: boolean, 
    correctAnswer: string, 
    explanation: string, 
    confidenceLevel: ConfidenceLevel,
    multiplier: number,
    timeSpent: number
  ) => {
    if (!currentProblem || !userId) return;

    setIsCorrect(correct);
    setShowResult(true);

    // Calculate rewards/penalties
    const baseReward = currentProblem.points_reward;
    let xpEarned = 0;
    let coinsEarned = 0;

    if (correct) {
      // Win: Apply multiplier
      xpEarned = Math.round(baseReward * multiplier);
      coinsEarned = Math.round((baseReward * multiplier) / 2);
    } else {
      // Loss: Penalty based on confidence level
      if (confidenceLevel === 'low') {
        xpEarned = -Math.round(baseReward * 0.25); // Small penalty
        coinsEarned = -Math.round((baseReward * 0.25) / 2);
      } else if (confidenceLevel === 'medium') {
        xpEarned = 0; // No penalty for medium confidence
        coinsEarned = 0;
      } else {
        // High or very high confidence: bigger penalty
        xpEarned = -Math.round(baseReward * multiplier * 0.5);
        coinsEarned = -Math.round((baseReward * multiplier * 0.5) / 2);
      }
    }

    // Record practice session with confidence data
    const { data: profileData } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single();

    await supabase
      .from("practice_sessions")
      .insert([{
        user_id: userId,
        problem_id: currentProblem.id,
        problem_text: currentProblem.problem_text,
        confidence_level: confidenceLevel,
        confidence_multiplier: multiplier,
        is_correct: correct,
        xp_earned: xpEarned,
        coins_earned: coinsEarned,
        time_spent_seconds: timeSpent,
        org_id: profileData?.org_id || null,
      }]);

    // Record attempt
    await supabase
      .from("problem_attempts")
      .insert([{
        user_id: userId,
        problem_id: currentProblem.id,
        is_correct: correct,
        time_spent_seconds: timeSpent,
      }]);

    // Update personalized question stats if applicable
    const { data: personalizedQuestion } = await supabase
      .from("personalized_questions")
      .select("times_attempted, times_correct")
      .eq("id", currentProblem.id)
      .maybeSingle();

    if (personalizedQuestion) {
      await supabase
        .from("personalized_questions")
        .update({
          times_attempted: personalizedQuestion.times_attempted + 1,
          times_correct: personalizedQuestion.times_correct + (correct ? 1 : 0),
        })
        .eq("id", currentProblem.id);
    }

    // Update user stats with gambling metrics
    await updateUserStatsWithGambling(xpEarned, coinsEarned, correct, confidenceLevel);
    await updateSpacedRepetition(currentProblem.id, correct);

    // Show animated feedback
    if (correct) {
      if (multiplier >= 2) {
        toast.success(
          `🎉 ${multiplier === 3 ? 'JACKPOT!' : 'BIG WIN!'} +${xpEarned} XP`, 
          { 
            description: `${multiplier}x multiplier! ${explanation}`,
            duration: 4000,
          }
        );
      } else {
        toast.success(`✅ Correct! +${xpEarned} XP`, {
          description: explanation,
        });
      }
      onPointsEarned?.(xpEarned);
    } else {
      if (xpEarned < 0) {
        toast.error(`💔 Lost ${Math.abs(xpEarned)} XP`, {
          description: `Better luck next time! ${explanation}`,
          duration: 4000,
        });
      } else {
        toast.error("❌ Incorrect", {
          description: explanation,
        });
      }
    }

    setProblemsToday(prev => prev + 1);
  };

  const updateSpacedRepetition = async (problemId: string, correct: boolean) => {
    if (!userId) return;

    // Check if this problem is already in spaced repetition
    const { data: existing } = await supabase
      .from("spaced_repetition")
      .select("*")
      .eq("user_id", userId)
      .eq("problem_id", problemId)
      .maybeSingle();

    const calculateNextReview = (interval: number, easeFactor: number, correct: boolean) => {
      let newInterval = interval;
      let newEaseFactor = easeFactor;

      if (correct) {
        newInterval = interval === 1 ? 6 : Math.round(interval * easeFactor);
        newEaseFactor = Math.max(1.3, easeFactor + 0.1);
      } else {
        newInterval = 1;
        newEaseFactor = Math.max(1.3, easeFactor - 0.2);
      }

      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

      return {
        interval: newInterval,
        easeFactor: newEaseFactor,
        nextReviewDate: nextReviewDate.toISOString().split('T')[0],
      };
    };

    if (existing) {
      // Update existing entry
      const { interval, easeFactor, nextReviewDate } = calculateNextReview(
        existing.interval_days, 
        existing.ease_factor, 
        correct
      );

      await supabase
        .from("spaced_repetition")
        .update({
          interval_days: interval,
          ease_factor: easeFactor,
          next_review_date: nextReviewDate,
          last_reviewed_date: new Date().toISOString().split('T')[0],
          repetition_number: existing.repetition_number + 1,
        })
        .eq("id", existing.id);
    } else {
      // Create new entry
      const { interval, easeFactor, nextReviewDate } = calculateNextReview(1, 2.5, correct);

      await supabase
        .from("spaced_repetition")
        .insert([{
          user_id: userId,
          problem_id: problemId,
          interval_days: interval,
          ease_factor: easeFactor,
          next_review_date: nextReviewDate,
          last_reviewed_date: new Date().toISOString().split('T')[0],
          repetition_number: 1,
        }]);
    }
  };

  const updateUserStatsWithGambling = async (xpEarned: number, coinsEarned: number, correct: boolean, confidenceLevel: ConfidenceLevel) => {
    if (!userId) return;

    const { data: stats } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    const newXP = Math.max(0, (stats?.experience_points || 0) + xpEarned);
    const newLevel = Math.floor(newXP / 100) + 1;
    const newCoins = Math.max(0, (stats?.coins || 0) + coinsEarned);

    // Update confidence accuracy
    const confidenceAccuracy = (stats?.confidence_accuracy as any) || {
      low: { correct: 0, total: 0 },
      medium: { correct: 0, total: 0 },
      high: { correct: 0, total: 0 },
      very_high: { correct: 0, total: 0 },
    };

    confidenceAccuracy[confidenceLevel].total += 1;
    if (correct) {
      confidenceAccuracy[confidenceLevel].correct += 1;
    }

    // Update gambling stats
    const totalGambles = (stats?.total_gambles || 0) + 1;
    const successfulGambles = (stats?.successful_gambles || 0) + (correct ? 1 : 0);
    const biggestWin = Math.max(stats?.biggest_win || 0, correct ? xpEarned : 0);
    const biggestLoss = Math.max(stats?.biggest_loss || 0, !correct ? Math.abs(xpEarned) : 0);

    await supabase
      .from("user_stats")
      .update({
        experience_points: newXP,
        level: newLevel,
        coins: newCoins,
        current_streak: correct ? streak + 1 : 0,
        longest_streak: Math.max(stats?.longest_streak || 0, correct ? streak + 1 : 0),
        last_activity_date: new Date().toISOString().split('T')[0],
        total_gambles: totalGambles,
        successful_gambles: successfulGambles,
        biggest_win: biggestWin,
        biggest_loss: biggestLoss,
        confidence_accuracy: confidenceAccuracy,
      })
      .eq("user_id", userId);
  };

  const loadDetailedExplanation = async () => {
    if (!currentProblem || !selectedAnswer) return;
    
    setLoadingDetailedExplanation(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-detailed-explanation', {
        body: {
          problemText: currentProblem.problem_text,
          correctAnswer: currentProblem.correct_answer,
          userAnswer: selectedAnswer,
          wasCorrect: isCorrect,
          courseContext: courseContext?.courseTitle 
            ? `${courseContext.courseTitle}${courseContext.courseTopics ? ` - Topics: ${courseContext.courseTopics.join(', ')}` : ''}`
            : null
        }
      });

      if (error) {
        console.error('Error loading detailed explanation:', error);
        toast.error('Failed to load detailed explanation');
        return;
      }

      if (data?.detailedExplanation) {
        setDetailedExplanation(data.detailedExplanation);
        setShowDetailedExplanation(true);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load detailed explanation');
    } finally {
      setLoadingDetailedExplanation(false);
    }
  };

  const handleNextProblem = () => {
    setDetailedExplanation("");
    setShowDetailedExplanation(false);
    setShowConfidenceSelector(false);
    setSelectedConfidence(null);
    setSubmissionStartTime(0);
    loadNextProblem();
  };

  if (loading) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="h-40 bg-muted rounded"></div>
      </Card>
    );
  }

  if (!currentProblem) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground mb-4">No problems available</p>
        <Button onClick={loadNextProblem} variant="retro">
          Load Problem
        </Button>
      </Card>
    );
  }

  const practiceTitle = courseContext?.courseTitle 
    ? `${courseContext.courseTitle} Practice`
    : "Practice Problems";

  return (
    <Card className="p-6 border-2 border-secondary-glow bg-gradient-to-br from-card to-secondary/10">
      <h2 className="text-xl font-bold mb-4 text-foreground flex items-center gap-2">
        🧪 {practiceTitle}
      </h2>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-secondary text-secondary-foreground">
              {currentProblem.subject}
            </Badge>
            <Badge variant="outline" className={`
              ${currentProblem.difficulty === 'beginner' ? 'bg-secondary' : 
                currentProblem.difficulty === 'intermediate' ? 'bg-energy' : 'bg-destructive'}
              text-white
            `}>
              {currentProblem.difficulty}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Today: {problemsToday}</span>
            <span className="flex items-center gap-1">
              🔥 {streak}
            </span>
          </div>
        </div>

        {/* Problem */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{currentProblem.problem_text}</h3>
          
          <div className="grid gap-2">
            {currentProblem.options.map((option, index) => (
              <button
                key={index}
                onClick={() => setSelectedAnswer(option)}
                disabled={showResult}
                className={`
                  p-3 text-left rounded-lg border-2 transition-all duration-200
                  ${selectedAnswer === option 
                    ? 'border-primary bg-primary/10 shadow-glow' 
                    : 'border-border hover:border-primary/50'}
                  ${showResult && option === currentProblem.correct_answer
                    ? 'border-secondary bg-secondary/10'
                    : ''}
                  ${showResult && selectedAnswer === option && option !== currentProblem.correct_answer
                    ? 'border-destructive bg-destructive/10'
                    : ''}
                `}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Confidence Selector */}
          {showConfidenceSelector && !showResult && (
            <div className="mt-4">
              <ConfidenceSelector
                baseReward={currentProblem.points_reward}
                onSelect={handleConfidenceSelected}
                disabled={false}
              />
            </div>
          )}

          {/* Action Buttons */}
          {!showConfidenceSelector && !showResult && (
            <Button 
              onClick={handleAnswerSelected}
              disabled={!selectedAnswer}
              variant="retro"
              size="lg"
              className="w-full"
            >
              Submit Answer (+{currentProblem.points_reward} XP)
            </Button>
          )}
          
          {showResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border-2 ${
                isCorrect 
                  ? 'border-secondary bg-secondary/10' 
                  : 'border-destructive bg-destructive/10'
              }`}>
                <p className={`font-semibold ${
                  isCorrect ? 'text-secondary-foreground' : 'text-destructive-foreground'
                }`}>
                  {isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                </p>
                
                {!isCorrect && currentProblem.wrong_answer_explanations?.[selectedAnswer] && (
                  <div className="mt-3 p-3 bg-card rounded border border-destructive/30">
                    <p className="text-sm font-medium text-destructive mb-1">
                      🔍 Why "{selectedAnswer}" is wrong:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {currentProblem.wrong_answer_explanations[selectedAnswer]}
                    </p>
                  </div>
                )}
                
                {currentProblem.explanation && (
                  <div className={`mt-3 p-3 rounded ${
                    isCorrect 
                      ? 'bg-card' 
                      : 'bg-secondary/20 border border-secondary/30'
                  }`}>
                    {!isCorrect && (
                      <p className="text-sm font-medium text-secondary mb-1">
                        ✅ Why "{currentProblem.correct_answer}" is correct:
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {currentProblem.explanation}
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={loadDetailedExplanation}
                variant="outline"
                className="w-full"
                disabled={loadingDetailedExplanation}
              >
                {loadingDetailedExplanation ? (
                  <>Loading...</>
                ) : showDetailedExplanation ? (
                  <>📚 Hide Detailed Explanation</>
                ) : (
                  <>📚 Show Detailed Explanation</>
                )}
              </Button>

              {showDetailedExplanation && detailedExplanation && (
                <div className="p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                  <h4 className="font-semibold text-primary mb-2 flex items-center gap-2">
                    🎓 In-Depth Explanation
                  </h4>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {detailedExplanation}
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleNextProblem}
                variant="neon"
                size="lg"
                className="w-full"
              >
                Next Problem
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}