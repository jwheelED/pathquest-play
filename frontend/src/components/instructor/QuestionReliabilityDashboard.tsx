import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Activity, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from "lucide-react";

interface SuccessRate {
  total_questions: number;
  successful_questions: number;
  failed_questions: number;
  success_rate: number;
  avg_processing_time_ms: number;
  most_common_error: string | null;
}

export const QuestionReliabilityDashboard = () => {
  const [stats, setStats] = useState<SuccessRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30>(7);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.rpc('get_question_success_rate', {
          p_instructor_id: user.id,
          p_days: timeRange
        });

        if (error) {
          console.error('Error fetching success rate:', error);
          return;
        }

        if (data && data.length > 0) {
          setStats(data[0]);
        }
      } catch (error) {
        console.error('Failed to fetch reliability stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Reliability
          </CardTitle>
          <CardDescription>Loading statistics...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!stats || stats.total_questions === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Reliability
          </CardTitle>
          <CardDescription>No questions sent yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const successRate = stats.success_rate || 0;
  const isHealthy = successRate >= 95;
  const isWarning = successRate >= 85 && successRate < 95;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Reliability
            </CardTitle>
            <CardDescription>
              Last {timeRange} days • {stats.total_questions} questions sent
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge 
              variant={timeRange === 7 ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setTimeRange(7)}
            >
              7 Days
            </Badge>
            <Badge 
              variant={timeRange === 30 ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setTimeRange(30)}
            >
              30 Days
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : isWarning ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span className="font-semibold">Success Rate</span>
            </div>
            <span className={`text-2xl font-bold ${
              isHealthy ? 'text-green-600' : isWarning ? 'text-amber-600' : 'text-red-600'
            }`}>
              {successRate.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={successRate} 
            className={`h-3 ${
              isHealthy ? 'bg-green-100' : isWarning ? 'bg-amber-100' : 'bg-red-100'
            }`}
          />
          <p className="text-xs text-muted-foreground">
            {stats.successful_questions} successful • {stats.failed_questions} failed
          </p>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          {/* Processing Time */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Avg Processing Time
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {stats.avg_processing_time_ms ? Math.round(stats.avg_processing_time_ms) : 0}ms
              </span>
              {stats.avg_processing_time_ms && stats.avg_processing_time_ms < 3000 && (
                <Badge variant="default" className="bg-green-600">Fast</Badge>
              )}
            </div>
          </div>

          {/* Success Trend */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Status
            </div>
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <Badge variant="default" className="bg-green-600">
                  ✅ Excellent
                </Badge>
              ) : isWarning ? (
                <Badge variant="default" className="bg-amber-600">
                  ⚠️ Good
                </Badge>
              ) : (
                <Badge variant="destructive">
                  ❌ Needs Attention
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Common Error */}
        {stats.most_common_error && stats.failed_questions > 0 && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Most Common Issue
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {stats.most_common_error.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </p>
          </div>
        )}

        {/* Health Recommendations */}
        {!isHealthy && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
              💡 Recommendations
            </p>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              {successRate < 85 && (
                <li>• Check your internet connection stability</li>
              )}
              {stats.avg_processing_time_ms > 5000 && (
                <li>• High processing times detected - try during off-peak hours</li>
              )}
              {stats.failed_questions > 5 && (
                <li>• Multiple failures detected - review error logs</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
