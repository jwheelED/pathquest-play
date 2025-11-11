import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Zap, AlertCircle, CheckCircle, Clock, FileText, TestTube } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AutoQuestionDebugDashboardProps {
  isEnabled: boolean;
  isRecording: boolean;
  nextQuestionIn: number;
  intervalMinutes: number;
  transcriptLength: number;
  lastError: string | null;
  lastErrorTime: Date | null;
  autoQuestionCount: number;
  isSendingQuestion: boolean;
  onTestNow: () => void;
  onToggleEnabled: () => void;
}

export const AutoQuestionDebugDashboard = ({
  isEnabled,
  isRecording,
  nextQuestionIn,
  intervalMinutes,
  transcriptLength,
  lastError,
  lastErrorTime,
  autoQuestionCount,
  isSendingQuestion,
  onTestNow,
  onToggleEnabled
}: AutoQuestionDebugDashboardProps) => {
  const formatTimeLeft = (seconds: number) => {
    if (seconds <= 0) return "Now";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusColor = () => {
    if (!isEnabled) return "bg-muted";
    if (!isRecording) return "bg-yellow-500/20 border-yellow-500/50";
    if (isSendingQuestion) return "bg-blue-500/20 border-blue-500/50 animate-pulse";
    if (lastError) return "bg-destructive/20 border-destructive/50";
    return "bg-green-500/20 border-green-500/50";
  };

  const getStatusIcon = () => {
    if (!isEnabled) return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    if (!isRecording) return <Clock className="h-5 w-5 text-yellow-500" />;
    if (isSendingQuestion) return <Zap className="h-5 w-5 text-blue-500 animate-pulse" />;
    if (lastError) return <AlertCircle className="h-5 w-5 text-destructive" />;
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  const getStatusText = () => {
    if (!isEnabled) return "Disabled";
    if (!isRecording) return "Waiting for recording";
    if (isSendingQuestion) return "Generating question...";
    if (lastError) return "Error";
    return "Active";
  };

  const progressPercent = intervalMinutes > 0 
    ? Math.min(100, ((intervalMinutes * 60 - nextQuestionIn) / (intervalMinutes * 60)) * 100)
    : 0;

  return (
    <Card className={`border-2 ${getStatusColor()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-base">Auto-Question Debug Dashboard</CardTitle>
              <CardDescription className="text-xs">
                Real-time monitoring and diagnostics
              </CardDescription>
            </div>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"}>
            {getStatusText()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Next Question
            </div>
            <div className="text-lg font-bold">
              {isEnabled && isRecording ? formatTimeLeft(nextQuestionIn) : "—"}
            </div>
            {isEnabled && isRecording && (
              <Progress value={progressPercent} className="h-1" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Transcript Length
            </div>
            <div className="text-lg font-bold">
              {transcriptLength.toLocaleString()}
              <span className="text-xs text-muted-foreground ml-1">chars</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {transcriptLength < 100 && isEnabled ? (
                <span className="text-yellow-500">Need 100+ chars</span>
              ) : (
                <span className="text-green-500">✓ Sufficient</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Interval</div>
            <div className="text-lg font-bold">
              {intervalMinutes}m
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Questions Sent</div>
            <div className="text-lg font-bold text-green-500">
              {autoQuestionCount}
            </div>
          </div>
        </div>

        {/* Last Error */}
        {lastError && lastErrorTime && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <div className="font-semibold">Last Error:</div>
              <div className="mt-1">{lastError}</div>
              <div className="text-xs opacity-70 mt-1">
                {formatDistanceToNow(lastErrorTime, { addSuffix: true })}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={onTestNow}
            disabled={transcriptLength < 100 || isSendingQuestion || !isRecording}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            <TestTube className="h-4 w-4 mr-2" />
            Test Now
          </Button>
          
          <Button
            onClick={onToggleEnabled}
            size="sm"
            variant={isEnabled ? "destructive" : "default"}
            className="flex-1"
          >
            <Zap className="h-4 w-4 mr-2" />
            {isEnabled ? "Disable" : "Enable"}
          </Button>
        </div>

        {/* Debug Info */}
        <div className="text-xs space-y-1 pt-2 border-t">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recording:</span>
            <span className={isRecording ? "text-green-500" : "text-muted-foreground"}>
              {isRecording ? "✓ Active" : "✗ Inactive"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Auto-enabled:</span>
            <span className={isEnabled ? "text-green-500" : "text-muted-foreground"}>
              {isEnabled ? "✓ Yes" : "✗ No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sending:</span>
            <span className={isSendingQuestion ? "text-blue-500" : "text-muted-foreground"}>
              {isSendingQuestion ? "⏳ Yes" : "✗ No"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
