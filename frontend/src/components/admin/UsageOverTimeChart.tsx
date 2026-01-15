import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
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

interface UsageOverTimeChartProps {
  data: WeeklyUsage[];
  loading?: boolean;
}

export default function UsageOverTimeChart({ data, loading }: UsageOverTimeChartProps) {
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

  const hasData = data.some((d) => d.sessions > 0 || d.questions > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Usage Over Time</CardTitle>
        <p className="text-sm text-muted-foreground">Sessions and questions per week</p>
      </CardHeader>
      <CardContent className="h-[300px]">
        {!hasData ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No session data in the last 4 weeks
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis 
                dataKey="week" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                yAxisId="left"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '10px' }}
              />
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
                dot={{ fill: 'hsl(var(--secondary))', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
