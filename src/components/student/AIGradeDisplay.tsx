import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ComponentScores {
  conceptual_understanding?: number;
  accuracy?: number;
  completeness?: number;
  application?: number;
  algorithmic_understanding?: number;
  logic_correctness?: number;
  code_quality?: number;
  edge_case_awareness?: number;
}

interface AIGradeDisplayProps {
  grade: number;
  feedback: string;
  components?: ComponentScores;
  questionType: 'short_answer' | 'coding' | 'coding_simple';
  understandsConcept?: boolean;
  className?: string;
  compact?: boolean;
}

const getGradeColor = (grade: number) => {
  if (grade >= 80) return "text-green-600 dark:text-green-400";
  if (grade >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
};

const getGradeBgColor = (grade: number) => {
  if (grade >= 80) return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  if (grade >= 60) return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
  return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
};

const getProgressColor = (grade: number) => {
  if (grade >= 80) return "bg-green-500";
  if (grade >= 60) return "bg-yellow-500";
  return "bg-red-500";
};

const GradeIcon = ({ grade }: { grade: number }) => {
  if (grade >= 70) {
    return <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />;
  }
  if (grade >= 50) {
    return <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />;
  }
  return <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />;
};

export const AIGradeDisplay = ({
  grade,
  feedback,
  components,
  questionType,
  understandsConcept,
  className,
  compact = false,
}: AIGradeDisplayProps) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const isCoding = questionType === 'coding' || questionType === 'coding_simple';

  // Short answer component labels
  const shortAnswerLabels: Record<string, { label: string; max: number }> = {
    conceptual_understanding: { label: "Conceptual Understanding", max: 25 },
    accuracy: { label: "Accuracy", max: 25 },
    completeness: { label: "Completeness", max: 25 },
    application: { label: "Application", max: 25 },
  };

  // Coding component labels
  const codingLabels: Record<string, { label: string; max: number }> = {
    algorithmic_understanding: { label: "Algorithm & Approach", max: 50 },
    logic_correctness: { label: "Logic Correctness", max: 30 },
    code_quality: { label: "Code Quality", max: 10 },
    edge_case_awareness: { label: "Edge Case Handling", max: 10 },
  };

  const componentLabels = isCoding ? codingLabels : shortAnswerLabels;

  if (compact) {
    return (
      <div className={cn("p-3 rounded-lg border", getGradeBgColor(grade), className)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <GradeIcon grade={grade} />
            <span className={cn("text-lg font-bold", getGradeColor(grade))}>
              {Math.round(grade)}%
            </span>
          </div>
          {understandsConcept !== undefined && (
            <span className={cn(
              "text-xs px-2 py-1 rounded-full",
              understandsConcept 
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
            )}>
              {understandsConcept ? "✓ Concept Understood" : "Review Needed"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{feedback}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border", getGradeBgColor(grade), className)}>
      {/* Main Grade Display */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <GradeIcon grade={grade} />
            <div>
              <span className={cn("text-2xl font-bold", getGradeColor(grade))}>
                {Math.round(grade)}%
              </span>
              <p className="text-xs text-muted-foreground">
                {isCoding 
                  ? (questionType === 'coding_simple' ? "Concept Check" : "Code Assessment")
                  : "Answer Assessment"
                }
              </p>
            </div>
          </div>
          {understandsConcept !== undefined && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
              understandsConcept 
                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
            )}>
              {understandsConcept ? (
                <>
                  <Lightbulb className="h-4 w-4" />
                  Concept Understood
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  Needs Review
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <Progress 
            value={grade} 
            className="h-2"
            style={{ 
              '--progress-indicator-color': grade >= 80 ? 'rgb(34 197 94)' : grade >= 60 ? 'rgb(234 179 8)' : 'rgb(239 68 68)'
            } as React.CSSProperties}
          />
        </div>

        {/* Feedback */}
        <div className="p-3 bg-background/50 rounded-md">
          <p className="text-sm font-medium mb-1 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Feedback
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{feedback}</p>
        </div>
      </div>

      {/* Component Breakdown (Collapsible) */}
      {components && Object.keys(components).length > 0 && (
        <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-center gap-2 py-3 border-t rounded-t-none"
            >
              {showBreakdown ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide Score Breakdown
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Why this grade?
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-2 space-y-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Your score breakdown by component:
              </p>
              {Object.entries(componentLabels).map(([key, config]) => {
                const score = components[key as keyof ComponentScores];
                if (score === undefined) return null;
                
                const percentage = (score / config.max) * 100;
                
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{config.label}</span>
                      <span className={cn("font-medium", getGradeColor(percentage))}>
                        {score}/{config.max}
                      </span>
                    </div>
                    <Progress 
                      value={percentage} 
                      className="h-1.5"
                      style={{ 
                        '--progress-indicator-color': percentage >= 80 ? 'rgb(34 197 94)' : percentage >= 60 ? 'rgb(234 179 8)' : 'rgb(239 68 68)'
                      } as React.CSSProperties}
                    />
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
