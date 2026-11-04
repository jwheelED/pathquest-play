import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MessageSquare, Users, ArrowUpRight, ArrowDownRight, Minus, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AggregateMetrics } from "@/hooks/useAdminDashboardData";

interface Props {
  metrics: AggregateMetrics;
  loading?: boolean;
  hasAnyData: boolean;
  onConnect?: () => void;
}

function Delta({ value, unit = "" }: { value: number; unit?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3 h-3" /> no change
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-600" : "text-destructive",
      )}
    >
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? "+" : ""}
      {value}
      {unit} vs prior period
    </span>
  );
}

function EmptyCard({
  icon: Icon,
  label,
  onConnect,
  hero,
}: {
  icon: any;
  label: string;
  onConnect?: () => void;
  hero?: boolean;
}) {
  return (
    <Card className={cn(hero && "md:col-span-2")}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="p-3 rounded-xl bg-muted">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          No session data yet. Connect your LMS to populate this.
        </p>
        {onConnect && (
          <Button size="sm" variant="outline" onClick={onConnect}>
            <PlugZap className="w-4 h-4 mr-2" />
            Connect LMS
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function AggregateMetricsCard({
  metrics,
  loading,
  hasAnyData,
  onConnect,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className={cn("animate-pulse", i === 1 && "md:col-span-2")}>
            <CardContent className="p-6">
              <div className="h-24 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EmptyCard icon={Users} label="Student Response Rate" onConnect={onConnect} hero />
        <EmptyCard icon={Users} label="Active Students (7d)" onConnect={onConnect} />
        <EmptyCard icon={Calendar} label="Sessions Run" onConnect={onConnect} />
      </div>
    );
  }

  const periodEmpty = metrics.sessionsUsed === 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Hero: Response Rate */}
      <Card className="md:col-span-2 relative overflow-hidden border-emerald-500/30">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Student Response Rate</p>
              <p className="text-5xl font-bold tracking-tight">{metrics.responseRate}%</p>
              {periodEmpty ? (
                <p className="text-xs text-muted-foreground">No activity in this period.</p>
              ) : (
                <Delta value={metrics.responseRateDelta} unit="pp" />
              )}
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active students */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Active Students (7d)</p>
              <p className="text-3xl font-bold tracking-tight">{metrics.activeStudents7d}</p>
              {periodEmpty ? (
                <p className="text-xs text-muted-foreground">No activity in this period.</p>
              ) : (
                <Delta value={metrics.activeStudents7dDelta} />
              )}
            </div>
            <div className="p-3 rounded-xl bg-secondary/10">
              <Users className="w-5 h-5 text-secondary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions run */}
      <Card className="md:col-span-3">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Sessions Run</p>
              <p className="text-3xl font-bold tracking-tight">{metrics.sessionsUsed}</p>
              <p className="text-xs text-muted-foreground">
                Avg {metrics.checksPerSession} checks per session
              </p>
              {!periodEmpty && <Delta value={metrics.sessionsUsedDelta} />}
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
