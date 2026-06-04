import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, Users, AlertTriangle, ArrowDown, ArrowUp, Minus, ChevronDown, ChevronRight, BookOpen, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EngagementSignal = "dropping" | "softening" | "steady" | "strong";

export interface CourseEngagement {
  id: string;
  title: string;
  instructorName: string;
  studentCount: number;
  responseRateCurrent: number;        // %
  responseRatePrior: number;          // %
  studentsDisengaging: number;        // count of enrolled w/ no response in 7d
  sevenDayActiveRate: number;         // %
  sparkline: number[];                // 4 weekly rates
  signal: EngagementSignal;
  avgGrade: number | null;            // demoted — drilldown only
  sessionsInWindow: number;
  topMisconception?: string | null;
}

interface CourseEngagementHealthCardProps {
  courses: CourseEngagement[];
  loading?: boolean;
  lmsConnected?: boolean;
  onConnectLms?: () => void;
}

const signalMeta: Record<EngagementSignal, { label: string; cls: string; dot: string }> = {
  dropping: { label: "Engagement dropping", cls: "bg-destructive/10 text-destructive border-destructive/20", dot: "bg-destructive" },
  softening: { label: "Softening", cls: "bg-amber-500/10 text-amber-700 border-amber-500/20", dot: "bg-amber-500" },
  steady:    { label: "Steady",    cls: "bg-muted text-muted-foreground border-border",       dot: "bg-muted-foreground" },
  strong:    { label: "Strong participation", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", dot: "bg-emerald-500" },
};

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...values, 100);
  const min = 0;
  const w = 80, h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - ((v - min) / (max - min || 1)) * h} r="1.5" className="fill-primary" />
      ))}
    </svg>
  );
}

function trendDelta(current: number, prior: number) {
  if (prior <= 0 && current <= 0) return { delta: 0, dir: "flat" as const };
  if (prior <= 0) return { delta: current, dir: "up" as const };
  const delta = current - prior;
  return { delta, dir: delta > 1 ? "up" as const : delta < -1 ? "down" as const : "flat" as const };
}

function suggestedAction(signal: EngagementSignal) {
  switch (signal) {
    case "dropping": return "Check in with the course team and review the last 2 session topics for confusion.";
    case "softening": return "Consider a quick low-stakes check-in to re-engage participants.";
    case "strong": return "Keep current cadence — engagement is healthy.";
    default: return "Monitor over the next few sessions.";
  }
}

export default function CourseEngagementHealthCard({
  courses,
  loading,
  lmsConnected = true,
  onConnectLms,
}: CourseEngagementHealthCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...courses].sort((a, b) => {
      const da = trendDelta(a.responseRateCurrent, a.responseRatePrior).delta;
      const db = trendDelta(b.responseRateCurrent, b.responseRatePrior).delta;
      return da - db; // biggest drop (most negative) first
    });
  }, [courses]);

  const totalStudents = courses.reduce((s, c) => s + c.studentCount, 0);
  const avgResp = courses.length
    ? Math.round(courses.reduce((s, c) => s + c.responseRateCurrent, 0) / courses.length)
    : 0;
  const needsSupport = courses.filter(c => c.signal === "dropping" || c.signal === "softening").length;

  return (
    <Card className="headspace-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Activity className="w-5 h-5 text-primary" />
          Course Engagement Health
        </CardTitle>
        <CardDescription>
          How students are participating across courses this period. Aggregate, formative, not evaluation.
        </CardDescription>

        <div className="flex flex-wrap gap-2 mt-4">
          <div className="stat-pill">
            <BookOpen className="w-4 h-4 text-primary" />
            {courses.length} Courses
          </div>
          <div className="stat-pill">
            <Users className="w-4 h-4 text-secondary" />
            {totalStudents} Students
          </div>
          <div className="stat-pill">
            <Activity className="w-4 h-4 text-primary" />
            {avgResp}% Avg Response Rate
          </div>
          {needsSupport > 0 && (
            <div className="stat-pill bg-amber-500/10 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              {needsSupport} Needs Support
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">Loading course engagement…</div>
          </div>
        ) : !lmsConnected ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Link2 className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-foreground font-medium mb-1">Connect your LMS to see course engagement</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Once connected, we’ll surface participation trends and flag courses that need support — without ranking instructors.
            </p>
            {onConnectLms && (
              <Button onClick={onConnectLms} size="sm">Connect LMS</Button>
            )}
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-foreground font-medium">No sessions run this period yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Engagement signals will appear here after your first live session.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Response Rate</TableHead>
                  <TableHead className="text-right">Students Disengaging</TableHead>
                  <TableHead className="text-right">7-Day Active</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => {
                  const { delta, dir } = trendDelta(c.responseRateCurrent, c.responseRatePrior);
                  const meta = signalMeta[c.signal];
                  const isOpen = expanded === c.id;
                  const isFlagged = c.signal === "dropping" || c.signal === "softening";
                  return (
                    <>
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                      >
                        <TableCell className="pr-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.studentCount} students · {c.sessionsInWindow} session{c.sessionsInWindow === 1 ? "" : "s"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5 font-semibold">
                            {c.responseRateCurrent}%
                            {dir === "down" && <ArrowDown className="w-3.5 h-3.5 text-destructive" />}
                            {dir === "up" && <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />}
                            {dir === "flat" && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                          {delta !== 0 && (
                            <div className={cn(
                              "text-xs",
                              dir === "down" ? "text-destructive" : dir === "up" ? "text-emerald-600" : "text-muted-foreground"
                            )}>
                              {delta > 0 ? "+" : ""}{Math.round(delta)} pts
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.studentsDisengaging > 0 ? (
                            <span className="font-semibold text-amber-700">{c.studentsDisengaging}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{Math.round(c.sevenDayActiveRate)}%</TableCell>
                        <TableCell><Sparkline values={c.sparkline} /></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-medium", meta.cls)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", meta.dot)} />
                            {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={c.id + "-detail"} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={6} className="py-4">
                            <div className="space-y-3 text-sm">
                              {isFlagged && (
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Why</div>
                                  <div className="text-foreground">
                                    Response rate moved from <span className="font-semibold">{c.responseRatePrior}%</span> to{" "}
                                    <span className="font-semibold">{c.responseRateCurrent}%</span> across the last{" "}
                                    {c.sessionsInWindow} session{c.sessionsInWindow === 1 ? "" : "s"}.
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Suggested action</div>
                                <div className="text-foreground">{suggestedAction(c.signal)}</div>
                              </div>
                              {c.topMisconception && (
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Top misconception this week</div>
                                  <div className="text-foreground">{c.topMisconception}</div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
                                <span>Course team: <span className="text-foreground">{c.instructorName}</span></span>
                                {c.avgGrade !== null && (
                                  <span>Avg grade (context): <span className="text-foreground">{c.avgGrade.toFixed(1)}%</span></span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
