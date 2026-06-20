import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BookOpen } from "lucide-react";

export interface CourseRollupRow {
  courseId: string;
  courseTitle: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

interface Props { rows: CourseRollupRow[]; loading?: boolean; }

export default function CourseAtRiskRollup({ rows, loading }: Props) {
  const sorted = [...rows].sort((a, b) =>
    (b.criticalCount * 3 + b.highCount * 2 + b.mediumCount) -
    (a.criticalCount * 3 + a.highCount * 2 + a.mediumCount)
  );
  const nonEmpty = sorted.filter(r => r.criticalCount + r.highCount + r.mediumCount > 0);

  return (
    <Card className="headspace-card">
      <CardHeader>
        <CardTitle className="text-xl">Where support is needed</CardTitle>
        <CardDescription>
          Support signals grouped by instructor's students (course-level rollup arrives with
          course enrollment). Names of individual students are gated to staff with documented
          legitimate educational interest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground animate-pulse">Loading…</div>
        ) : nonEmpty.length === 0 ? (
          <div className="py-10 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No courses currently showing support signals.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {nonEmpty.map(r => (
              <div
                key={r.courseId}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="font-medium">{r.courseTitle}</div>
                <div className="flex gap-2 text-xs">
                  {r.criticalCount > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {r.criticalCount} Critical
                    </Badge>
                  )}
                  {r.highCount > 0 && (
                    <Badge className="bg-orange-500 text-white">{r.highCount} High</Badge>
                  )}
                  {r.mediumCount > 0 && (
                    <Badge className="bg-yellow-500 text-yellow-950">{r.mediumCount} Medium</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
