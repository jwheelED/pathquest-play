import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle, TrendingUp, Users, BookOpen, Plug, MessageCircle,
} from "lucide-react";

interface RetentionHealthCardProps {
  lmsConnected: boolean;
  hasRecentSessions: boolean;
  atRiskCount: number;
  totalStudents: number;
  sevenDayResponseRate: number | null;   // null when no signal yet
  inactiveCount: number;
  sessionsPerStudent: number | null;
  onConnect?: () => void;
}

function MetricTile({
  icon: Icon, label, value, sub, healthBg, healthText, progress,
}: {
  icon: any; label: string;
  value: string;
  sub: string;
  healthBg: string;
  healthText: string;
  progress?: number;
}) {
  return (
    <div className={`rounded-2xl p-4 ${healthBg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${healthText}`} />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-3xl font-bold ${healthText}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      {typeof progress === "number" && <Progress value={progress} className="h-1.5 mt-2" />}
    </div>
  );
}

export default function RetentionHealthCard(props: RetentionHealthCardProps) {
  const {
    lmsConnected, hasRecentSessions, atRiskCount, totalStudents,
    sevenDayResponseRate, inactiveCount, sessionsPerStudent, onConnect,
  } = props;

  // Empty state: no LMS or no signal yet
  if (!lmsConnected || !hasRecentSessions || totalStudents === 0) {
    return (
      <Card className="headspace-card border-2 border-dashed border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="w-5 h-5 text-primary" />
            Retention Health
          </CardTitle>
          <CardDescription>
            {!lmsConnected
              ? "Connect your LMS to populate retention metrics."
              : "No sessions have been run in this period yet — metrics will appear once participation data exists."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!lmsConnected && (
            <Button onClick={onConnect} className="gap-2">
              <Plug className="w-4 h-4" />
              Connect LMS
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const fmtPct = (v: number | null) =>
    v === null || Number.isNaN(v) ? "—" : `${v.toFixed(0)}%`;
  const fmtNum = (v: number | null) =>
    v === null || Number.isNaN(v) ? "—" : v.toFixed(1);

  const rrColor =
    sevenDayResponseRate === null ? "text-muted-foreground"
      : sevenDayResponseRate < 40 ? "text-destructive"
      : sevenDayResponseRate < 65 ? "text-orange-500"
      : "text-primary";
  const rrBg =
    sevenDayResponseRate === null ? "bg-muted/30"
      : sevenDayResponseRate < 40 ? "bg-destructive/10"
      : sevenDayResponseRate < 65 ? "bg-orange-500/10"
      : "bg-primary/10";

  const inactivePct = totalStudents > 0 ? (inactiveCount / totalStudents) * 100 : 0;
  const atRiskPct = totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : 0;

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="headspace-card border-2 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="w-5 h-5 text-primary" />
            Retention Health
          </CardTitle>
          <CardDescription>
            Behavioral participation signals — leading indicators, not grade-based.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`rounded-2xl p-4 ${rrBg} cursor-help`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className={`w-5 h-5 ${rrColor}`} />
                    <span className="text-sm font-medium text-muted-foreground">
                      7-Day Response Rate
                    </span>
                  </div>
                  <div className={`text-3xl font-bold ${rrColor}`}>
                    {fmtPct(sevenDayResponseRate)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Live question participation
                  </div>
                  <Progress value={sevenDayResponseRate ?? 0} className="h-1.5 mt-2" />
                </div>
              </TooltipTrigger>
              <TooltipContent>Hero metric: behavioral leading indicator of disengagement.</TooltipContent>
            </Tooltip>

            <MetricTile
              icon={Users}
              label="Inactive ≥7 days"
              value={String(inactiveCount)}
              sub={`${inactivePct.toFixed(1)}% of students`}
              healthBg={inactivePct > 20 ? "bg-destructive/10" : inactivePct > 10 ? "bg-orange-500/10" : "bg-primary/10"}
              healthText={inactivePct > 20 ? "text-destructive" : inactivePct > 10 ? "text-orange-500" : "text-primary"}
              progress={100 - inactivePct}
            />

            <MetricTile
              icon={BookOpen}
              label="Sessions / Student"
              value={fmtNum(sessionsPerStudent)}
              sub="Avg in last 28 days"
              healthBg="bg-primary/10"
              healthText="text-primary"
            />

            <MetricTile
              icon={AlertTriangle}
              label="Needs support"
              value={String(atRiskCount)}
              sub={`${atRiskPct.toFixed(1)}% of students`}
              healthBg={atRiskPct > 20 ? "bg-destructive/10" : atRiskPct > 10 ? "bg-orange-500/10" : "bg-primary/10"}
              healthText={atRiskPct > 20 ? "text-destructive" : atRiskPct > 10 ? "text-orange-500" : "text-primary"}
              progress={100 - atRiskPct}
            />
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
