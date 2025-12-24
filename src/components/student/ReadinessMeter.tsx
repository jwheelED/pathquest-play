import { useReadinessScore } from '@/hooks/useReadinessScore';
import { Button } from '@/components/ui/button';
import { Play, Loader2, Calendar, Brain, ClipboardCheck, Zap } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReadinessMeterProps {
  userId: string;
  classId?: string;
  className?: string;
  onContinue: () => void;
}

export function ReadinessMeter({ userId, classId, className, onContinue }: ReadinessMeterProps) {
  const { readiness, conceptMastery, assignmentsProgress, challengesProgress, loading, studyPlan } = useReadinessScore(userId, classId);

  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (readiness / 100) * circumference;

  // Dynamic color based on readiness
  const getReadinessColor = () => {
    if (readiness >= 70) return 'hsl(160, 70%, 45%)'; // emerald
    if (readiness >= 40) return 'hsl(45, 93%, 55%)'; // amber
    return 'hsl(0, 84%, 60%)'; // red
  };

  const getReadinessLabel = () => {
    if (readiness >= 70) return 'Great Progress!';
    if (readiness >= 40) return 'Keep Going!';
    return "Let's Start!";
  };

  const getContextualSubtitle = () => {
    if (studyPlan) {
      return `Ready for ${studyPlan.title}`;
    }
    return 'Overall Readiness';
  };

  const getDaysLabel = () => {
    if (!studyPlan) return null;
    const days = studyPlan.daysUntilExam;
    if (days === 0) return 'Exam today!';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  return (
    <div className={`flex flex-col md:flex-row items-center gap-6 md:gap-10 ${className}`}>
      {/* Circular Progress */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-44 h-44 md:w-52 md:h-52 cursor-help">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                {/* Background circle */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="12"
                />
                {/* Progress circle */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke={getReadinessColor()}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={loading ? circumference : strokeDashoffset}
                  className="transition-all duration-1000 ease-out"
                  style={{
                    filter: `drop-shadow(0 0 12px ${getReadinessColor()})`,
                  }}
                />
              </svg>
              
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <span className="text-4xl md:text-5xl font-bold text-foreground">
                      {readiness}%
                    </span>
                    <span className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-[120px]">
                      {getContextualSubtitle()}
                    </span>
                    {studyPlan && (
                      <span className="text-xs font-medium text-primary mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {getDaysLabel()}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[280px] p-4">
            <div className="space-y-3">
              <p className="font-semibold text-sm">Score Breakdown</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Brain className="w-4 h-4" />
                    <span>Concept Mastery</span>
                  </div>
                  <span className="font-medium">{conceptMastery}%</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Assignments</span>
                  </div>
                  <span className="font-medium">{assignmentsProgress}%</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Zap className="w-4 h-4" />
                    <span>Daily Challenges</span>
                  </div>
                  <span className="font-medium">{challengesProgress}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                50% mastery • 30% assignments • 20% challenges
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Action Area */}
      <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
            {getReadinessLabel()}
          </h2>
          <p className="text-muted-foreground">
            {studyPlan 
              ? `You're preparing for your upcoming exam`
              : 'Your personalized learning path awaits'
            }
          </p>
        </div>
        
        <Button
          size="lg"
          onClick={onContinue}
          className="pulse-action rounded-full px-8 py-6 text-lg font-semibold shadow-xl hover:shadow-2xl bg-primary hover:bg-primary/90 gap-3"
        >
          <Play className="w-5 h-5" />
          Continue Path
        </Button>
      </div>
    </div>
  );
}
