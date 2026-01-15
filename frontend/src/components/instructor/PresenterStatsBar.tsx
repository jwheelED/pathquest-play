import { CheckCircle, Clock, Users } from "lucide-react";

interface PresenterStatsBarProps {
  stats: {
    responseCount: number;
    correctCount: number;
    correctPercentage: number | null;
    avgResponseTime: number | null;
  };
  participantCount: number;
}

export const PresenterStatsBar = ({ stats, participantCount }: PresenterStatsBarProps) => {
  const formatResponseTime = (ms: number | null): string => {
    if (ms === null) return "—";
    const seconds = Math.round(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Responses</p>
          <p className="text-2xl font-bold">
            {stats.responseCount}/{participantCount}
          </p>
        </div>
      </div>

      {stats.correctPercentage !== null && (
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Correct</p>
            <p className="text-2xl font-bold text-primary">
              {Math.round(stats.correctPercentage)}%
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Avg Time</p>
          <p className="text-2xl font-bold">
            {formatResponseTime(stats.avgResponseTime)}
          </p>
        </div>
      </div>
    </div>
  );
};
