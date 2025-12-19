import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, ChevronRight, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options?: { label: string; text: string }[];
  correct_answer: string;
  explanation: string;
  difficulty: string;
  points_reward: number;
  topic_tags?: string[];
}

interface PracticeQuestionCardProps {
  question: Question;
  onComplete: (correct: boolean) => void;
  onSkip: () => void;
  onClose: () => void;
}

export function PracticeQuestionCard({ 
  question, 
  onComplete, 
  onSkip,
  onClose 
}: PracticeQuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const options = question.options || [];
  const isMultipleChoice = question.question_type === 'multiple_choice' && options.length > 0;

  const handleSubmit = async () => {
    if (!selectedAnswer) return;

    setSubmitting(true);
    
    try {
      // Check if correct
      const correct = selectedAnswer === question.correct_answer;
      setIsCorrect(correct);
      setIsSubmitted(true);

      // Update the question stats
      await supabase
        .from('personalized_questions')
        .update({
          times_attempted: (question as any).times_attempted + 1,
          times_correct: correct ? (question as any).times_correct + 1 : (question as any).times_correct,
        })
        .eq('id', question.id);

      if (correct) {
        toast.success(`+${question.points_reward} XP`, {
          description: 'Great job!',
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('Error updating question:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    onComplete(isCorrect ?? false);
  };

  const difficultyColors: Record<string, string> = {
    easy: 'bg-green-500/20 text-green-600',
    medium: 'bg-yellow-500/20 text-yellow-600',
    hard: 'bg-red-500/20 text-red-600',
    beginner: 'bg-green-500/20 text-green-600',
    intermediate: 'bg-yellow-500/20 text-yellow-600',
    advanced: 'bg-orange-500/20 text-orange-600',
    expert: 'bg-red-500/20 text-red-600',
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={difficultyColors[question.difficulty] || ''}>
              {question.difficulty}
            </Badge>
            {question.topic_tags?.[0] && (
              <Badge variant="secondary" className="text-xs">
                {question.topic_tags[0]}
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            +{question.points_reward} XP
          </span>
        </div>
      </div>

      {/* Question */}
      <div className="p-6">
        <p className="text-lg font-medium text-foreground leading-relaxed mb-6">
          {question.question_text}
        </p>

        {/* Options */}
        {isMultipleChoice ? (
          <div className="space-y-3">
            {options.map((option) => {
              const isSelected = selectedAnswer === option.label;
              const isCorrectAnswer = option.label === question.correct_answer;
              
              let optionClass = 'border-border hover:border-primary/50 hover:bg-accent/50';
              if (isSubmitted) {
                if (isCorrectAnswer) {
                  optionClass = 'border-green-500 bg-green-500/10';
                } else if (isSelected && !isCorrect) {
                  optionClass = 'border-red-500 bg-red-500/10';
                }
              } else if (isSelected) {
                optionClass = 'border-primary bg-primary/10';
              }

              return (
                <button
                  key={option.label}
                  onClick={() => !isSubmitted && setSelectedAnswer(option.label)}
                  disabled={isSubmitted}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 text-left transition-all',
                    optionClass,
                    isSubmitted && 'cursor-default'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0',
                      isSubmitted && isCorrectAnswer ? 'bg-green-500 text-white' :
                      isSubmitted && isSelected && !isCorrect ? 'bg-red-500 text-white' :
                      isSelected ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {isSubmitted && isCorrectAnswer ? <Check className="w-4 h-4" /> :
                       isSubmitted && isSelected && !isCorrect ? <X className="w-4 h-4" /> :
                       option.label}
                    </span>
                    <span className="text-foreground pt-1">{option.text}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground italic">
            Short answer questions coming soon
          </p>
        )}

        {/* Explanation */}
        {isSubmitted && (
          <div className="mt-6 space-y-4 animate-fade-in">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Lightbulb className="w-4 h-4" />
              {showExplanation ? 'Hide' : 'Show'} Explanation
            </button>
            
            {showExplanation && (
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {question.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={isSubmitted ? onClose : onSkip}
          >
            {isSubmitted ? 'Close' : 'Skip'}
          </Button>

          {!isSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!selectedAnswer || submitting}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Submit
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleContinue} className="gap-2">
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
