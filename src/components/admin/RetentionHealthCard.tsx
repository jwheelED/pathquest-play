import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, TrendingUp, Users, Clock, BookOpen } from "lucide-react";

interface RetentionHealthCardProps {
  atRiskCount: number;
  totalStudents: number;
  passRate: number;
  retentionRate: number;
  avgCompletionRate: number;
}

export default function RetentionHealthCard({
  atRiskCount,
  totalStudents,
  passRate,
  retentionRate,
  avgCompletionRate,
}: RetentionHealthCardProps) {
  const atRiskPercentage = totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : 0;

  const getHealthColor = (value: number, threshold: { danger: number; warning: number }) => {
    if (value < threshold.danger) return "text-destructive";
    if (value < threshold.warning) return "text-orange-500";
    return "text-primary";
  };

  const getHealthBg = (value: number, threshold: { danger: number; warning: number }) => {
    if (value < threshold.danger) return "bg-destructive/10";
    if (value < threshold.warning) return "bg-orange-500/10";
    return "bg-primary/10";
  };

  const getAtRiskColor = () => {
    if (atRiskPercentage > 20) return "text-destructive";
    if (atRiskPercentage > 10) return "text-orange-500";
    return "text-primary";
  };

  const getAtRiskBg = () => {
    if (atRiskPercentage > 20) return "bg-destructive/10";
    if (atRiskPercentage > 10) return "bg-orange-500/10";
    return "bg-primary/10";
  };

  return (
    <Card className="headspace-card border-2 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <TrendingUp className="w-5 h-5 text-primary" />
          Retention Health
        </CardTitle>
        <CardDescription>Key metrics for help indication</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* At-Risk Students */}
          <div className={`rounded-2xl p-4 ${getAtRiskBg()}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`w-5 h-5 ${getAtRiskColor()}`} />
              <span className="text-sm font-medium text-muted-foreground">At-Risk</span>
            </div>
            <div className={`text-3xl font-bold ${getAtRiskColor()}`}>{atRiskCount}</div>
            <div className="text-xs text-muted-foreground mt-1">{atRiskPercentage.toFixed(1)}% of students</div>
            <Progress value={100 - atRiskPercentage} className="h-1.5 mt-2" />
          </div>

          {/* Pass Rate */}
          <div className={`rounded-2xl p-4 ${getHealthBg(passRate, { danger: 70, warning: 80 })}`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`w-5 h-5 ${getHealthColor(passRate, { danger: 70, warning: 80 })}`} />
              <span className="text-sm font-medium text-muted-foreground">Pass Rate</span>
            </div>
            <div className={`text-3xl font-bold ${getHealthColor(passRate, { danger: 70, warning: 80 })}`}>
              {passRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Students above 60%</div>
            <Progress value={passRate} className="h-1.5 mt-2" />
          </div>

          {/* 7-Day Retention */}
          <div className={`rounded-2xl p-4 ${getHealthBg(retentionRate, { danger: 60, warning: 75 })}`}>
            <div className="flex items-center gap-2 mb-2">
              <Users className={`w-5 h-5 ${getHealthColor(retentionRate, { danger: 60, warning: 75 })}`} />
              <span className="text-sm font-medium text-muted-foreground">7-Day Active</span>
            </div>
            <div className={`text-3xl font-bold ${getHealthColor(retentionRate, { danger: 60, warning: 75 })}`}>
              {retentionRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Active in last 7 days</div>
            <Progress value={retentionRate} className="h-1.5 mt-2" />
          </div>

          {/* Completion Rate */}
          <div className={`rounded-2xl p-4 ${getHealthBg(avgCompletionRate, { danger: 50, warning: 70 })}`}>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className={`w-5 h-5 ${getHealthColor(avgCompletionRate, { danger: 50, warning: 70 })}`} />
              <span className="text-sm font-medium text-muted-foreground">Completion</span>
            </div>
            <div className={`text-3xl font-bold ${getHealthColor(avgCompletionRate, { danger: 50, warning: 70 })}`}>
              {avgCompletionRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Avg assignment completion</div>
            <Progress value={avgCompletionRate} className="h-1.5 mt-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
