import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface PresenterQuestionCardProps {
  question: {
    question_number: number;
    question_content: {
      question: string;
      type: string;
      options?: string[];
      correctAnswer?: string;
    };
    sent_at: string;
  };
  stats: {
    responseCount: number;
    correctCount: number;
    correctPercentage: number | null;
    avgResponseTime: number | null;
  };
  participantCount: number;
}

export const PresenterQuestionCard = ({
  question,
  stats,
  participantCount,
}: PresenterQuestionCardProps) => {
  const responsePercentage = participantCount > 0 
    ? (stats.responseCount / participantCount) * 100 
    : 0;

  const formatResponseTime = (ms: number | null): string => {
    if (ms === null) return "—";
    const seconds = Math.round(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="p-6 bg-card rounded-lg border-2 border-primary shadow-lg space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Q{question.question_number}
            </span>
            <Badge variant="default" className="text-xs">
              {question.question_content.type === 'multiple_choice' ? 'MCQ' : 'Short Answer'}
            </Badge>
          </div>
          <p className="text-2xl font-semibold leading-tight">
            {question.question_content.question}
          </p>
        </div>
      </div>

      {/* Options for MCQ */}
      {question.question_content.type === 'multiple_choice' && question.question_content.options && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          {question.question_content.options.map((option, idx) => {
            const label = String.fromCharCode(65 + idx); // A, B, C, D
            const isCorrect = label === question.question_content.correctAnswer;
            
            return (
              <div
                key={idx}
                className={`p-3 rounded-lg border-2 ${
                  isCorrect
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/30'
                }`}
              >
                <span className="font-semibold mr-2">{label}.</span>
                <span className="text-sm">{option}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Response Progress */}
      <div className="space-y-2 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Response Progress</span>
          <span className="font-semibold">
            {stats.responseCount}/{participantCount}
          </span>
        </div>
        <Progress value={responsePercentage} className="h-3" />
        <p className="text-xs text-muted-foreground text-right">
          {Math.round(responsePercentage)}% responded
        </p>
      </div>

      {/* Stats Grid */}
      {stats.correctPercentage !== null && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Correct Answers</p>
            <p className="text-3xl font-bold text-primary">
              {Math.round(stats.correctPercentage)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.correctCount} of {stats.responseCount}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-1">Avg Response Time</p>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <p className="text-3xl font-bold">
                {formatResponseTime(stats.avgResponseTime)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
