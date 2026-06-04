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

  // Course-tied recommendations
  const recommendations: { text: string; course?: string }[] = [];
  const misconceptionCourses = new Set(
    misconceptions.map((m) => m.courseName).filter(Boolean) as string[],
  );
  const confidenceCourses = new Set(
    confidenceIssues.map((c) => c.courseName).filter(Boolean) as string[],
  );

  misconceptionCourses.forEach((course) => {
    recommendations.push({
      text: `Run a mini-review on the topics students miss most`,
      course,
    });
  });
  confidenceCourses.forEach((course) => {
    if (!misconceptionCourses.has(course)) {
      recommendations.push({
        text: `Address overconfidence with targeted feedback`,
        course,
      });
    }
  });

  if (recommendations.length === 0) {
    recommendations.push({
      text: "No learning gaps detected this period.",
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Learning Insights</CardTitle>
        <p className="text-sm text-muted-foreground">
          Aggregate patterns from check-in responses. Course-level only — no named instructors or
          students.
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
              <p className="text-sm text-muted-foreground">
                No misconceptions detected this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {misconceptions.map((item, idx) => (
                  <li
                    key={idx}
                    className="text-sm p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1"
                  >
                    <p className="font-medium text-foreground line-clamp-2">{item.questionText}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.correctRate}% correct · {item.totalResponses} responses
                      {item.courseName ? ` · ${item.courseName}` : ""}
                    </p>
                    <p className="text-xs text-destructive">
                      Suggested: share with the{item.courseName ? ` ${item.courseName}` : ""}{" "}
                      instructor team.
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
              Confident but Wrong
            </div>
            {confidenceIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overconfidence patterns this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {confidenceIssues.map((item, idx) => (
                  <li
                    key={idx}
                    className="text-sm p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-1"
                  >
                    <p className="font-medium text-foreground line-clamp-2">{item.questionText}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.confidentWrongCount} students confidently wrong
                      {item.courseName ? ` · ${item.courseName}` : ""}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Suggested: targeted re-teach in
                      {item.courseName ? ` ${item.courseName}` : " the affected course"}.
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
                  className="text-sm p-3 rounded-lg bg-primary/5 border border-primary/10"
                >
                  <p className="text-foreground">{rec.text}</p>
                  {rec.course && (
                    <p className="text-xs text-muted-foreground mt-1">For {rec.course}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
