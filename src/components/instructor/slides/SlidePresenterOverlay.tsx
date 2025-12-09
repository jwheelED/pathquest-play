import { useState, useEffect } from 'react';
import { usePresenterReceiver } from '@/hooks/useLecturePresenterChannel';
import { useLecturePresenterData } from '@/hooks/useLecturePresenterData';
import { Clock, Users, Send, CheckCircle, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DirectState {
  isRecording: boolean;
  recordingDuration: number;
  studentCount: number;
  autoQuestionEnabled: boolean;
  nextAutoQuestionIn: number;
}

interface SlidePresenterOverlayProps {
  directState?: DirectState;
}

export function SlidePresenterOverlay({ directState }: SlidePresenterOverlayProps) {
  const [isRecording, setIsRecording] = useState(directState?.isRecording || false);
  const [nextQuestionIn, setNextQuestionIn] = useState(directState?.nextAutoQuestionIn || 0);
  const [studentCount, setStudentCount] = useState(directState?.studentCount || 0);
  const [lastQuestionText, setLastQuestionText] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(directState?.recordingDuration || 0);
  const [flashNotification, setFlashNotification] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [autoQuestionEnabled, setAutoQuestionEnabled] = useState(directState?.autoQuestionEnabled || false);

  // Fetch real-time question stats
  const { currentQuestion, studentCount: fetchedStudentCount, calculateQuestionStats } = useLecturePresenterData();
  
  // Calculate stats for the first question in current group
  const currentStats = currentQuestion && currentQuestion.questions.length > 0
    ? calculateQuestionStats(currentQuestion.assignments, 0, currentQuestion.questions[0])
    : null;

  // Update from direct props when they change
  useEffect(() => {
    if (directState) {
      setIsRecording(directState.isRecording);
      setRecordingDuration(directState.recordingDuration);
      setStudentCount(directState.studentCount);
      setAutoQuestionEnabled(directState.autoQuestionEnabled);
      setNextQuestionIn(directState.nextAutoQuestionIn);
    }
  }, [directState]);

  // Listen for broadcasts from main dashboard (fallback when not using direct props)
  usePresenterReceiver((message) => {
    // Skip broadcast updates if we have direct state
    if (directState) return;
    
    switch (message.type) {
      case 'state_update':
        if (message.data.isRecording !== undefined) setIsRecording(message.data.isRecording);
        if (message.data.nextAutoQuestionIn !== undefined) setNextQuestionIn(message.data.nextAutoQuestionIn);
        if (message.data.studentCount !== undefined) setStudentCount(message.data.studentCount);
        if (message.data.recordingDuration !== undefined) setRecordingDuration(message.data.recordingDuration);
        if (message.data.autoQuestionEnabled !== undefined) setAutoQuestionEnabled(message.data.autoQuestionEnabled);
        break;
      case 'countdown_tick':
        if (message.data.nextAutoQuestionIn !== undefined) setNextQuestionIn(message.data.nextAutoQuestionIn);
        break;
      case 'question_sent':
        if (message.data.lastQuestionSent?.question) {
          setLastQuestionText(message.data.lastQuestionSent.question);
        }
        setFlashNotification(true);
        setTimeout(() => setFlashNotification(false), 2000);
        break;
      case 'recording_status':
        if (message.data.isRecording !== undefined) setIsRecording(message.data.isRecording);
        break;
    }
  });

  // Local countdown interpolation
  useEffect(() => {
    if (nextQuestionIn <= 0) return;
    const interval = setInterval(() => {
      setNextQuestionIn((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextQuestionIn > 0]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCountdownColor = () => {
    if (nextQuestionIn <= 10) return 'text-red-400';
    if (nextQuestionIn <= 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getCorrectPercentColor = (percent: number | null) => {
    if (percent === null) return 'text-slate-400';
    if (percent >= 70) return 'text-emerald-400';
    if (percent >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  if (isMinimized) {
    return (
      <div
        className={cn(
          "absolute top-4 right-4 z-50 cursor-pointer transition-all duration-300",
          flashNotification && "ring-4 ring-emerald-400 rounded-full"
        )}
        onClick={() => setIsMinimized(false)}
      >
        <div className="bg-slate-900/90 backdrop-blur-sm rounded-full p-3 flex items-center gap-2">
          {isRecording ? (
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-slate-500" />
          )}
          {autoQuestionEnabled && nextQuestionIn > 0 && (
            <span className={cn("text-sm font-bold tabular-nums", getCountdownColor())}>
              {formatTime(nextQuestionIn)}
            </span>
          )}
          <div className="flex items-center gap-1 text-slate-400">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs">{studentCount}</span>
          </div>
          {currentStats && currentStats.responseCount > 0 && currentStats.correctPercentage !== null && (
            <span className={cn("text-xs font-bold", getCorrectPercentColor(currentStats.correctPercentage))}>
              {Math.round(currentStats.correctPercentage)}%
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute top-4 right-4 z-50 w-72 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden transition-all duration-300",
        flashNotification && "ring-4 ring-emerald-400"
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-slate-800/50 cursor-pointer"
        onClick={() => setIsMinimized(true)}
      >
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-400">LIVE</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span className="text-xs font-medium text-slate-400">STANDBY</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {isRecording && (
            <span className="tabular-nums">{formatDuration(recordingDuration)}</span>
          )}
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{studentCount}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Next Question Timer */}
        {autoQuestionEnabled && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">Next Question</span>
              </div>
              <span className={cn("text-xl font-bold tabular-nums", getCountdownColor())}>
                {nextQuestionIn > 0 ? formatTime(nextQuestionIn) : '—:——'}
              </span>
            </div>
            {nextQuestionIn > 0 && (
              <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-1000 rounded-full",
                    nextQuestionIn <= 10 ? 'bg-red-500' : 
                    nextQuestionIn <= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, (nextQuestionIn / 60) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Response Stats */}
        {currentStats && currentStats.responseCount > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Last Question Stats</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  <Users className="w-3 h-3" />
                </div>
                <div className="text-sm font-bold text-slate-200">
                  {currentStats.responseCount}/{studentCount}
                </div>
                <div className="text-[9px] text-slate-500">Responses</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <CheckCircle className={cn("w-3 h-3", getCorrectPercentColor(currentStats.correctPercentage))} />
                </div>
                <div className={cn("text-sm font-bold", getCorrectPercentColor(currentStats.correctPercentage))}>
                  {currentStats.correctPercentage !== null ? `${Math.round(currentStats.correctPercentage)}%` : '—'}
                </div>
                <div className="text-[9px] text-slate-500">Correct</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  <Timer className="w-3 h-3" />
                </div>
                <div className="text-sm font-bold text-slate-200">
                  {currentStats.avgResponseTime}s
                </div>
                <div className="text-[9px] text-slate-500">Avg Time</div>
              </div>
            </div>
          </div>
        )}

        {/* Last Question Sent */}
        {lastQuestionText && (
          <div className="bg-slate-800/30 rounded-lg p-2.5">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">Last Sent</span>
            </div>
            <p className="text-xs text-slate-300 line-clamp-2">
              {lastQuestionText.length > 80 ? `${lastQuestionText.substring(0, 80)}...` : lastQuestionText}
            </p>
          </div>
        )}

        {/* Not Recording Message */}
        {!isRecording && (
          <div className="text-center py-2">
            <p className="text-xs text-slate-500">
              Start recording from your dashboard to see live stats
            </p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 bg-slate-800/30 text-center">
        <span className="text-[10px] text-slate-600">Click header to minimize • EDVANA</span>
      </div>
    </div>
  );
}
