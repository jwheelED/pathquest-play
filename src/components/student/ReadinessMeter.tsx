import { useReadinessScore } from '@/hooks/useReadinessScore';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

interface ReadinessMeterProps {
  userId: string;
  classId?: string;
  className?: string;
  onContinue: () => void;
}

export function ReadinessMeter({ userId, classId, className, onContinue }: ReadinessMeterProps) {
  const { readiness, loading } = useReadinessScore(userId, classId);

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
    return 'Let\'s Start!';
  };

  return (
    <div className={`flex flex-col md:flex-row items-center gap-6 md:gap-10 ${className}`}>
      {/* Circular Progress */}
      <div className="relative w-44 h-44 md:w-52 md:h-52">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          ) : (
            <>
              <span className="text-4xl md:text-5xl font-bold text-foreground">
                {readiness}%
              </span>
              <span className="text-sm text-muted-foreground mt-1">Ready</span>
            </>
          )}
        </div>
      </div>

      {/* Action Area */}
      <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
            {getReadinessLabel()}
          </h2>
          <p className="text-muted-foreground">
            Your personalized learning path awaits
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
