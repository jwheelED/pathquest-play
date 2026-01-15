import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, XCircle, Lightbulb } from "lucide-react";
import type { MisconceptionItem, ConfidenceIssue } from "@/hooks/useAdminDashboardData";

interface LearningInsightsCardProps {
  misconceptions: MisconceptionItem[];
  confidenceIssues: ConfidenceIssue[];
  loading?: boolean;
}

export default function LearningInsightsCard({
  misconceptions,
  confidenceIssues,
  loading,
}: LearningInsightsCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Learning Insights</CardTitle>
        </CardHeader>
        <CardContent className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Generate recommendations based on data
  const recommendations: string[] = [];
  
  if (misconceptions.length > 0) {
    const avgCorrectRate = misconceptions.reduce((acc, m) => acc + m.correctRate, 0) / misconceptions.length;
    if (avgCorrectRate < 40) {
      recommendations.push("Consider a mini-review session on commonly missed topics");
    }
  }
  
  if (confidenceIssues.length > 0) {
    recommendations.push("Address overconfidence with targeted feedback on flagged concepts");
  }
  
  if (misconceptions.length === 0 && confidenceIssues.length === 0) {
    recommendations.push("Great job! No major learning gaps detected in recent sessions");
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Learning Insights</CardTitle>
        <p className="text-sm text-muted-foreground">
          Aggregate patterns from check-in responses
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Top Misconceptions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <XCircle className="w-4 h-4" />
              Top Misconceptions
            </div>
            {misconceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No significant misconceptions detected</p>
            ) : (
              <ul className="space-y-2">
                {misconceptions.map((item, idx) => (
                  <li key={idx} className="text-sm p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <p className="font-medium text-foreground line-clamp-2">{item.questionText}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.correctRate}% correct ({item.totalResponses} responses)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confidence Issues */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Confidence Issues
            </div>
            {confidenceIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overconfidence patterns detected</p>
            ) : (
              <ul className="space-y-2">
                {confidenceIssues.map((item, idx) => (
                  <li key={idx} className="text-sm p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <p className="font-medium text-foreground line-clamp-2">{item.questionText}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.confidentWrongCount} students were confidently wrong
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recommended Actions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Lightbulb className="w-4 h-4" />
              Recommended Actions
            </div>
            <ul className="space-y-2">
              {recommendations.map((rec, idx) => (
                <li
                  key={idx}
                  className="text-sm p-2 rounded-lg bg-primary/5 border border-primary/10"
                >
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
