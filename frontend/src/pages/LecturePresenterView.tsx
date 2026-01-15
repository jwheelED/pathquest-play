import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Radio, Users, X, Minimize2, Maximize2, Bell, AlertCircle } from "lucide-react";
import { useLecturePresenterData } from "@/hooks/useLecturePresenterData";
import { PresenterQuestionCard } from "@/components/instructor/PresenterQuestionCard";
import { PresenterStatsBar } from "@/components/instructor/PresenterStatsBar";
import { usePresenterReceiver, type PresenterBroadcast } from "@/hooks/useLecturePresenterChannel";
import { cn } from "@/lib/utils";

export default function LecturePresenterView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMiniMode = searchParams.get('mini') === 'true';

  const {
    studentCount: dbStudentCount,
    currentQuestion,
    recentQuestions,
    calculateQuestionStats,
    loading,
    error,
    lectureStartTime,
  } = useLecturePresenterData();

  // Broadcast state from main dashboard
  const [broadcastState, setBroadcastState] = useState<{
    isRecording: boolean;
    autoQuestionEnabled: boolean;
    autoQuestionInterval: number;
    nextAutoQuestionIn: number;
    recordingDuration: number;
    studentCount: number;
    lastQuestionSent?: {
      question: string;
      type: string;
      timestamp: string;
    };
  }>({
    isRecording: false,
    autoQuestionEnabled: false,
    autoQuestionInterval: 15,
    nextAutoQuestionIn: 0,
    recordingDuration: 0,
    studentCount: dbStudentCount,
  });

  const [questionFlash, setQuestionFlash] = useState(false);
  const lastQuestionRef = useRef<string | null>(null);

  // Listen to broadcast messages
  const handleBroadcastMessage = useCallback((broadcast: PresenterBroadcast) => {
    setBroadcastState(prev => ({
      ...prev,
      ...broadcast.data,
    }));

    // Flash effect when question is sent
    if (broadcast.type === 'question_sent' && broadcast.data.lastQuestionSent) {
      const questionTimestamp = broadcast.data.lastQuestionSent.timestamp;
      if (lastQuestionRef.current !== questionTimestamp) {
        lastQuestionRef.current = questionTimestamp;
        setQuestionFlash(true);
        setTimeout(() => setQuestionFlash(false), 2000);
        
        // Play subtle notification sound
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      }
    }
  }, []);

  usePresenterReceiver(handleBroadcastMessage);

  const [lectureDuration, setLectureDuration] = useState(0);
  const [timeSinceLastQuestion, setTimeSinceLastQuestion] = useState(0);

  // Use broadcast recording duration or calculate from lecture start time
  useEffect(() => {
    if (broadcastState.isRecording && broadcastState.recordingDuration > 0) {
      setLectureDuration(broadcastState.recordingDuration);
      return;
    }

    if (!lectureStartTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const duration = Math.floor((now.getTime() - lectureStartTime.getTime()) / 1000);
      setLectureDuration(duration);
    }, 1000);

    return () => clearInterval(interval);
  }, [lectureStartTime, broadcastState.isRecording, broadcastState.recordingDuration]);

  // Update time since last question
  useEffect(() => {
    if (!currentQuestion) return;

    const interval = setInterval(() => {
      const now = new Date();
      const lastQuestionTime = new Date(currentQuestion.timestamp);
      const timeSince = Math.floor((now.getTime() - lastQuestionTime.getTime()) / 1000);
      setTimeSinceLastQuestion(timeSince);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentQuestion]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use broadcast student count if available, otherwise use DB count
  const studentCount = broadcastState.studentCount > 0 ? broadcastState.studentCount : dbStudentCount;

  // Calculate current question stats
  const currentStats = currentQuestion ? (() => {
    const question = currentQuestion.questions[0];
    const stats = calculateQuestionStats(currentQuestion.assignments, 0, question);
    return {
      responseCount: stats.responseCount,
      correctCount: stats.correctCount,
      correctPercentage: stats.correctPercentage,
      avgResponseTime: stats.avgResponseTime ? stats.avgResponseTime * 1000 : null,
    };
  })() : null;

  if (loading) {
    return (
      <div className={cn("min-h-screen bg-background flex items-center justify-center", isMiniMode && "h-[200px]")}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("min-h-screen bg-background flex items-center justify-center p-4", isMiniMode && "h-[200px]")}>
        <div className="text-center">
          <p className="text-xs text-destructive mb-2">Error: {error}</p>
          <Button onClick={() => window.close()} variant="outline" size="sm">
            Close
          </Button>
        </div>
      </div>
    );
  }

  // MINI MODE - Compact timer widget
  if (isMiniMode) {
    return (
      <div className={cn(
        "h-[200px] w-full bg-gradient-to-br from-background to-muted/30 p-3 flex flex-col",
        questionFlash && "animate-pulse border-2 border-primary"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              broadcastState.isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground"
            )}></div>
            <span className="text-xs font-medium">
              {broadcastState.isRecording ? "LIVE" : "STANDBY"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{studentCount}</span>
          </div>
        </div>

        {/* Next Question Countdown */}
        {broadcastState.autoQuestionEnabled && broadcastState.isRecording && (
          <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Next question in</p>
            <p className="text-4xl font-bold text-primary tabular-nums">
              {formatTime(broadcastState.nextAutoQuestionIn)}
            </p>
          </div>
        )}

        {/* Last Question Preview */}
        {broadcastState.lastQuestionSent && (
          <div className="mt-2 p-2 bg-primary/10 rounded border border-primary/20">
            <div className="flex items-start gap-2">
              <Bell className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary">Last Sent</p>
                <p className="text-xs text-foreground line-clamp-1">
                  {broadcastState.lastQuestionSent.question.substring(0, 50)}...
                </p>
                {currentStats && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentStats.responseCount}/{studentCount} • {Math.round(currentStats.correctPercentage || 0)}% ✓
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // FULL MODE - Original detailed view
  return (
    <div className={cn("min-h-screen bg-background", questionFlash && "animate-pulse")}>
      {/* Flash border effect when question sent */}
      {questionFlash && (
        <div className="fixed inset-0 pointer-events-none border-4 border-primary animate-pulse z-50" />
      )}

      {/* Header Bar */}
      <div className="bg-card border-b border-border p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                broadcastState.isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground"
              )}></div>
              <span className="text-sm font-medium">
                {broadcastState.isRecording ? "LIVE LECTURE" : "STANDBY"}
              </span>
            </div>
            {broadcastState.autoQuestionEnabled && (
              <Badge variant="outline" className="text-xs">
                Auto: {broadcastState.autoQuestionInterval}min
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{studentCount}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{formatTime(lectureDuration)}</span>
            </div>
            <Button onClick={() => window.close()} variant="ghost" size="sm">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Auto-Question Countdown */}
        {broadcastState.autoQuestionEnabled && broadcastState.isRecording && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Next auto-question in</p>
                <p className="text-5xl font-bold text-primary tabular-nums mb-1">
                  {formatTime(broadcastState.nextAutoQuestionIn)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Interval: {broadcastState.autoQuestionInterval} minutes
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentQuestion && currentStats ? (
          <>
            {/* Time Since Last Question */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Time since question sent</p>
              <p className="text-3xl font-bold text-primary">{formatTime(timeSinceLastQuestion)}</p>
            </div>

            {/* Current Question */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Current Question</h2>
              <PresenterQuestionCard
                question={{
                  question_number: 1,
                  question_content: currentQuestion.questions[0],
                  sent_at: currentQuestion.timestamp,
                }}
                stats={currentStats}
                participantCount={studentCount}
              />
              <PresenterStatsBar stats={currentStats} participantCount={studentCount} />
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No question sent yet</h3>
            <p className="text-sm text-muted-foreground">
              Questions will appear here when you send them during the lecture
            </p>
            {broadcastState.autoQuestionEnabled && broadcastState.isRecording && (
              <p className="text-xs text-muted-foreground mt-2">
                Auto-question will trigger in {formatTime(broadcastState.nextAutoQuestionIn)}
              </p>
            )}
          </div>
        )}

        {/* Recent Questions */}
        {recentQuestions.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold">Recent Questions</h2>
            <div className="space-y-3">
              {recentQuestions.map((questionGroup, index) => {
                const question = questionGroup.questions[0];
                const stats = calculateQuestionStats(questionGroup.assignments, 0, question);
                const timeAgo = Math.floor((Date.now() - new Date(questionGroup.timestamp).getTime()) / 1000);
                
                return (
                  <div key={index} className="bg-muted/30 rounded-lg p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">
                          {question.type === 'multiple_choice' ? 'Multiple Choice' : 
                           question.type === 'short_answer' ? 'Short Answer' : 'Coding'}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatTime(timeAgo)} ago</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {stats.responseCount}/{studentCount} responded
                        </p>
                        {stats.correctPercentage !== null && (
                          <p className="text-xs text-muted-foreground">
                            {Math.round(stats.correctPercentage)}% correct
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{question.question}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Session Info */}
        {currentQuestion && (
          <div className="mt-8 pt-6 border-t border-border">
            <div className="text-center text-sm text-muted-foreground">
              <p>Lecture started at {lectureStartTime?.toLocaleTimeString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
