import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface STEMPracticeProps {
  userId?: string;
  onPointsEarned?: (points: number) => void;
}

interface STEMProblem {
  id: string;
  subject: string;
  difficulty: string;
  problem_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points_reward: number;
}

export default function STEMPractice({ userId, onPointsEarned }: STEMPracticeProps) {
  const [currentProblem, setCurrentProblem] = useState<STEMProblem | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problemsToday, setProblemsToday] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchDailyProgress();
      loadNextProblem();
    }
  }, [userId]);

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

  const loadNextProblem = async () => {
    setLoading(true);
    try {
      // Get problems due for review first, then new problems
      const { data: reviewProblems, error: reviewError } = await supabase
        .from("spaced_repetition")
        .select(`
          problem_id,
          stem_problems (
            id, subject, difficulty, problem_text, options, 
            correct_answer, explanation, points_reward
          )
        `)
        .eq("user_id", userId)
        .lte("next_review_date", new Date().toISOString().split('T')[0]);

      let problem = null;
      
      if (!reviewError && reviewProblems && reviewProblems.length > 0) {
        // Use a review problem
        const randomReview = reviewProblems[Math.floor(Math.random() * reviewProblems.length)];
        problem = randomReview.stem_problems;
      } else {
        // Get a random new problem
        const { data: newProblems, error: newError } = await supabase
          .from("stem_problems")
          .select("*")
          .limit(10);
        
        if (!newError && newProblems && newProblems.length > 0) {
          problem = newProblems[Math.floor(Math.random() * newProblems.length)];
        }
      }

      setCurrentProblem(problem);
      setSelectedAnswer("");
      setShowResult(false);
    } catch (error) {
      console.error("Error loading problem:", error);
      toast.error("Failed to load problem");
    }
    setLoading(false);
  };

  const submitAnswer = async () => {
    if (!currentProblem || !selectedAnswer || !userId) return;

    const correct = selectedAnswer === currentProblem.correct_answer;
    setIsCorrect(correct);
    setShowResult(true);

    // Record the attempt
    await supabase
      .from("problem_attempts")
      .insert([{
        user_id: userId,
        problem_id: currentProblem.id,
        is_correct: correct,
      }]);

    // Update spaced repetition schedule
    if (correct) {
      await updateSpacedRepetition(currentProblem.id, correct);
      await updateUserStats(currentProblem.points_reward);
      
      toast.success(`Correct! +${currentProblem.points_reward} XP`, {
        description: currentProblem.explanation,
      });
      
      onPointsEarned?.(currentProblem.points_reward);
    } else {
      await updateSpacedRepetition(currentProblem.id, correct);
      toast.error("Incorrect answer", {
        description: currentProblem.explanation,
      });
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
      .single();

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

  const updateUserStats = async (points: number) => {
    if (!userId) return;

    const { data: stats } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    const newXP = (stats?.experience_points || 0) + points;
    const newLevel = Math.floor(newXP / 100) + 1;
    const newCoins = (stats?.coins || 0) + Math.floor(points / 2);

    await supabase
      .from("user_stats")
      .update({
        experience_points: newXP,
        level: newLevel,
        coins: newCoins,
        current_streak: streak + 1,
        longest_streak: Math.max(stats?.longest_streak || 0, streak + 1),
        last_activity_date: new Date().toISOString().split('T')[0],
      })
      .eq("user_id", userId);
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

  return (
    <Card className="p-6 border-2 border-secondary-glow bg-gradient-to-br from-card to-secondary/10">
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
                  disabled:cursor-not-allowed
                `}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          {!showResult ? (
            <Button 
              onClick={submitAnswer}
              disabled={!selectedAnswer}
              variant="retro"
              size="lg"
              className="w-full"
            >
              Submit Answer (+{currentProblem.points_reward} XP)
            </Button>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border-2 ${
                isCorrect 
                  ? 'border-secondary bg-secondary/10 text-secondary-foreground' 
                  : 'border-destructive bg-destructive/10 text-destructive-foreground'
              }`}>
                <p className="font-semibold">
                  {isCorrect ? '🎉 Correct!' : '❌ Incorrect'}
                </p>
                <p className="text-sm mt-2">{currentProblem.explanation}</p>
              </div>
              
              <Button 
                onClick={loadNextProblem}
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