import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MessageSquare, Users } from "lucide-react";
import type { AggregateMetrics } from "@/hooks/useAdminDashboardData";

interface AggregateMetricsCardProps {
  metrics: AggregateMetrics;
  loading?: boolean;
}

export default function AggregateMetricsCard({ metrics, loading }: AggregateMetricsCardProps) {
  const metricItems = [
    {
      label: "Sessions Used",
      value: metrics.sessionsUsed,
      subtitle: "Last 4 weeks",
      icon: Calendar,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Checks per Session",
      value: metrics.checksPerSession,
      subtitle: "Average",
      icon: MessageSquare,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      label: "Student Response Rate",
      value: `${metrics.responseRate}%`,
      subtitle: "Participation",
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {metricItems.map((item) => (
        <Card key={item.label} className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <p className="text-3xl font-bold tracking-tight">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
              <div className={`p-3 rounded-xl ${item.bgColor}`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
