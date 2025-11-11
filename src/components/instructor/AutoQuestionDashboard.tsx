import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, Users, Zap, TrendingUp, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SkipReason {
  timestamp: Date;
  reason: string;
  details?: string;
}

export interface AutoQuestionMetrics {
  questionsSent: number;
  questionsSkipped: number;
  averageQuality: number;
  skipReasons: SkipReason[];
}

interface AutoQuestionDashboardProps {
  isRecording: boolean;
  autoQuestionEnabled: boolean;
  autoQuestionInterval: number;
  studentCount: number;
  nextAutoQuestionIn: number;
  intervalTranscriptLength: number;
  contentQualityScore: number;
  metrics: AutoQuestionMetrics;
  rateLimitSecondsLeft: number;
  dailyQuestionCount: number;
  dailyQuotaLimit: number;
}

export const AutoQuestionDashboard = ({
  isRecording,
  autoQuestionEnabled,
  autoQuestionInterval,
  studentCount,
  nextAutoQuestionIn,
  intervalTranscriptLength,
  contentQualityScore,
  metrics,
  rateLimitSecondsLeft,
  dailyQuestionCount,
  dailyQuotaLimit,
}: AutoQuestionDashboardProps) => {
  // Calculate overall health status
  const getHealthStatus = (): { status: 'healthy' | 'warning' | 'blocked'; message: string; icon: JSX.Element } => {
    if (!isRecording) {
      return { 
        status: 'blocked', 
        message: 'Recording stopped', 
        icon: <XCircle className="h-4 w-4" /> 
      };
    }
    
    if (studentCount === 0) {
      return { 
        status: 'blocked', 
        message: 'No students connected', 
        icon: <XCircle className="h-4 w-4" /> 
      };
    }
    
    if (!autoQuestionEnabled) {
      return { 
        status: 'blocked', 
        message: 'Auto-questions disabled', 
        icon: <XCircle className="h-4 w-4" /> 
      };
    }
    
    if (dailyQuestionCount >= dailyQuotaLimit) {
      return { 
        status: 'blocked', 
        message: 'Daily quota reached', 
        icon: <XCircle className="h-4 w-4" /> 
      };
    }
    
    if (intervalTranscriptLength < 100) {
      return { 
        status: 'warning', 
        message: 'Waiting for content', 
        icon: <AlertCircle className="h-4 w-4" /> 
      };
    }
    
    if (contentQualityScore < 0.35) {
      return { 
        status: 'warning', 
        message: 'Content quality low', 
        icon: <AlertCircle className="h-4 w-4" /> 
      };
    }
    
    return { 
      status: 'healthy', 
      message: 'All systems operational', 
      icon: <CheckCircle className="h-4 w-4" /> 
    };
  };

  const healthStatus = getHealthStatus();
  const successRate = metrics.questionsSent + metrics.questionsSkipped > 0 
    ? (metrics.questionsSent / (metrics.questionsSent + metrics.questionsSkipped) * 100).toFixed(0)
    : '0';

  // Get recent skip reasons (last 5)
  const recentSkips = metrics.skipReasons.slice(-5).reverse();

  return (
    <Card className={`border-2 ${
      healthStatus.status === 'healthy' ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' :
      healthStatus.status === 'warning' ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20' :
      'border-red-500/50 bg-red-50/50 dark:bg-red-950/20'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Auto-Question Monitor
          </CardTitle>
          <Badge 
            variant={
              healthStatus.status === 'healthy' ? 'default' : 
              healthStatus.status === 'warning' ? 'secondary' : 
              'destructive'
            }
            className="flex items-center gap-1"
          >
            {healthStatus.icon}
            {healthStatus.status === 'healthy' ? '🟢' : healthStatus.status === 'warning' ? '🟡' : '🔴'}
            {healthStatus.message}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-4 gap-2">
          {/* Students */}
          <div className="bg-background border rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Students</span>
            </div>
            <div className={`text-sm font-bold ${studentCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {studentCount > 0 ? `✅ ${studentCount}` : '❌ 0'}
            </div>
          </div>

          {/* Content Size */}
          <div className="bg-background border rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Content</span>
            </div>
            <div className={`text-sm font-bold ${intervalTranscriptLength >= 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {intervalTranscriptLength}/100
            </div>
          </div>

          {/* Quality Score */}
          <div className="bg-background border rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Quality</span>
            </div>
            <div className={`text-sm font-bold ${
              contentQualityScore >= 0.5 ? 'text-green-600 dark:text-green-400' : 
              contentQualityScore >= 0.35 ? 'text-amber-600 dark:text-amber-400' : 
              'text-red-600 dark:text-red-400'
            }`}>
              {(contentQualityScore * 100).toFixed(0)}%
            </div>
          </div>

          {/* Next Question */}
          <div className="bg-background border rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Next</span>
            </div>
            <div className="text-sm font-bold">
              {rateLimitSecondsLeft > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">⏱️ {rateLimitSecondsLeft}s</span>
              ) : (
                <span className="text-blue-600 dark:text-blue-400">
                  {Math.floor(nextAutoQuestionIn / 60)}:{(nextAutoQuestionIn % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Success Metrics */}
        <div className="bg-background border rounded-lg p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">Session Metrics</div>
          
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-1">Sent</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {metrics.questionsSent}
              </div>
            </div>
            
            <div>
              <div className="text-muted-foreground mb-1">Skipped</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {metrics.questionsSkipped}
              </div>
            </div>
            
            <div>
              <div className="text-muted-foreground mb-1">Success Rate</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {successRate}%
              </div>
            </div>
          </div>

          {metrics.averageQuality > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Avg Quality</span>
                <span className="font-bold">{(metrics.averageQuality * 100).toFixed(0)}%</span>
              </div>
              <Progress value={metrics.averageQuality * 100} className="h-1.5 mt-1" />
            </div>
          )}
        </div>

        {/* Recent Skip Reasons */}
        {recentSkips.length > 0 && (
          <div className="bg-background border rounded-lg p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Recent Skips ({recentSkips.length})
            </div>
            <ScrollArea className="h-24">
              <div className="space-y-1.5">
                {recentSkips.map((skip, index) => (
                  <div 
                    key={index} 
                    className="text-xs p-2 bg-muted/50 rounded border"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-amber-700 dark:text-amber-400">
                          {skip.reason}
                        </div>
                        {skip.details && (
                          <div className="text-muted-foreground mt-0.5">
                            {skip.details}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {skip.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Countdown Animation */}
        {autoQuestionEnabled && nextAutoQuestionIn <= 10 && nextAutoQuestionIn > 0 && healthStatus.status === 'healthy' && (
          <div className="animate-pulse bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600 animate-bounce" />
              <span className="font-bold text-blue-900 dark:text-blue-200">
                Auto-question in {nextAutoQuestionIn}s...
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
