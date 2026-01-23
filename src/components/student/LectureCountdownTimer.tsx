import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Zap, PauseCircle, PlayCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface LectureCountdownTimerProps {
  instructorId: string;
}

export const LectureCountdownTimer = ({ instructorId }: LectureCountdownTimerProps) => {
  const [isActive, setIsActive] = useState(false);
  const [localCountdown, setLocalCountdown] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(0);
  const [isUrgent, setIsUrgent] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const channelRef = useRef<any>(null);
  const lastSyncRef = useRef<number>(0);

  // Subscribe to instructor's timer channel
  useEffect(() => {
    if (!instructorId) return;

    const channelName = `lecture-timer-${instructorId}`;
    console.log('📻 Student subscribing to timer channel:', channelName);

    channelRef.current = supabase
      .channel(channelName)
      .on('broadcast', { event: 'timer_update' }, (payload: any) => {
        const { nextQuestionIn, intervalMinutes: interval, autoQuestionEnabled, isRecording } = payload.payload;
        
        const shouldBeActive = autoQuestionEnabled && isRecording;
        setIsActive(shouldBeActive);
        
        if (shouldBeActive) {
          setLocalCountdown(nextQuestionIn);
          setIntervalMinutes(interval);
          lastSyncRef.current = Date.now();
          console.log('⏱️ Timer sync received:', nextQuestionIn, 'seconds');
        }
      })
      .on('broadcast', { event: 'question_sent' }, () => {
        console.log('🎯 Question sent - timer flash');
        setFlashEffect(true);
        setTimeout(() => setFlashEffect(false), 1000);
      })
      .subscribe((status) => {
        console.log('📡 Student timer subscription status:', status);
      });

    return () => {
      if (channelRef.current) {
        console.log('📻 Unsubscribing from timer channel');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [instructorId]);

  // Local countdown interpolation between broadcasts (respect pause)
  useEffect(() => {
    if (!isActive || localCountdown <= 0 || isPaused) return;

    const interval = setInterval(() => {
      setLocalCountdown(prev => {
        const newVal = Math.max(0, prev - 1);
        setIsUrgent(newVal <= 30 && newVal > 0);
        return newVal;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, localCountdown, isPaused]);

  // Don't render if not in active lecture
  if (!isActive) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = intervalMinutes > 0
    ? ((intervalMinutes * 60 - localCountdown) / (intervalMinutes * 60)) * 100
    : 0;

  const statusMessage = isPaused 
    ? "Questions paused" 
    : isUrgent 
      ? "Get ready! Question coming soon" 
      : `Next question in ${formatTime(localCountdown)}`;

  return (
    <Card 
      className={cn(
        "border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 transition-all duration-300",
        isUrgent && !isPaused && "border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-orange-600/15 animate-pulse",
        flashEffect && "ring-2 ring-green-500 border-green-500"
      )}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={statusMessage}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={cn(
              "w-5 h-5",
              isUrgent && !isPaused ? "text-orange-500" : "text-primary"
            )} aria-hidden="true" />
            <span className="text-sm font-medium">Next Question In</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className={cn(
              "w-4 h-4",
              isUrgent && !isPaused ? "text-orange-500 animate-pulse" : "text-yellow-500"
            )} aria-hidden="true" />
            <span 
              className={cn(
                "text-2xl font-bold tabular-nums transition-colors",
                isPaused ? "text-muted-foreground" : isUrgent ? "text-orange-500" : "text-primary"
              )}
              aria-hidden="true"
            >
              {isPaused ? "--:--" : formatTime(localCountdown)}
            </span>
          </div>
        </div>
        <Progress 
          value={isPaused ? 0 : progressPercent} 
          className={cn(
            "h-2 mt-3",
            isUrgent && !isPaused && "[&>div]:bg-orange-500"
          )}
          aria-hidden="true"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">
            {isPaused ? "Questions are paused" : isUrgent ? "Get ready!" : `Auto-question every ${intervalMinutes} minutes`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="h-7 px-2 text-xs"
            aria-label={isPaused ? "Resume incoming questions" : "Pause incoming questions"}
          >
            {isPaused ? (
              <>
                <PlayCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                Resume
              </>
            ) : (
              <>
                <PauseCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                Pause
              </>
            )}
          </Button>
        </div>
        {/* Screen reader only live announcement */}
        <span className="sr-only" role="status">
          {statusMessage}
        </span>
      </CardContent>
    </Card>
  );
};
