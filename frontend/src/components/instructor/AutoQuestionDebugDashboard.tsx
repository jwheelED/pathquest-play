import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, AlertCircle, CheckCircle, Clock, TestTube } from "lucide-react";

interface AutoQuestionDebugDashboardProps {
  isEnabled: boolean;
  isRecording: boolean;
  nextQuestionIn: number;
  intervalMinutes: number;
  isSendingQuestion: boolean;
  onTestNow: () => void;
  onToggleEnabled: () => void;
}

export const AutoQuestionDebugDashboard = ({
  isEnabled,
  isRecording,
  nextQuestionIn,
  intervalMinutes,
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
    return "bg-green-500/20 border-green-500/50";
  };

  const getStatusIcon = () => {
    if (!isEnabled) return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    if (!isRecording) return <Clock className="h-5 w-5 text-yellow-500" />;
    if (isSendingQuestion) return <Zap className="h-5 w-5 text-blue-500 animate-pulse" />;
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  const getStatusText = () => {
    if (!isEnabled) return "Disabled";
    if (!isRecording) return "Waiting for recording";
    if (isSendingQuestion) return "Generating question...";
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
              <CardTitle className="text-base">Auto-Question Monitor</CardTitle>
              <CardDescription className="text-xs">
                Automated interval-based question sending
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
            <div className="text-xs text-muted-foreground">Interval</div>
            <div className="text-lg font-bold">
              {intervalMinutes}m
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={onTestNow}
            disabled={isSendingQuestion || !isRecording}
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
      </CardContent>
    </Card>
  );
};
