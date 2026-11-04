import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlugZap } from "lucide-react";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from "recharts";
import type { WeeklyUsage } from "@/hooks/useAdminDashboardData";

interface Props {
  data: WeeklyUsage[];
  loading?: boolean;
  hasAnyData: boolean;
  onConnect?: () => void;
}

export default function UsageOverTimeChart({ data, loading, hasAnyData, onConnect }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] animate-pulse">
          <div className="w-full h-full bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasPeriodData = data.some((d) => d.sessions > 0 || d.questions > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Usage Over Time</CardTitle>
        <p className="text-sm text-muted-foreground">Sessions and questions per week</p>
      </CardHeader>
      <CardContent className="h-[300px]">
        {!hasAnyData ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <PlugZap className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              No session data yet. Connect your LMS to start populating weekly trends.
            </p>
            {onConnect && (
              <Button size="sm" variant="outline" onClick={onConnect}>
                Connect LMS
              </Button>
            )}
          </div>
        ) : !hasPeriodData ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            No activity in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="week"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ paddingTop: "10px" }} />
              <Bar
                yAxisId="left"
                dataKey="sessions"
                name="Sessions"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="questions"
                name="Questions"
                stroke="hsl(var(--secondary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--secondary))", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
