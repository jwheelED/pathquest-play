import { useState, useEffect } from 'react';
import { usePresenterReceiver } from '@/hooks/useLecturePresenterChannel';
import { Clock, Users, CheckCircle, Radio } from 'lucide-react';

interface PiPPresenterWidgetProps {
  initialData?: {
    isRecording?: boolean;
    nextAutoQuestionIn?: number;
    studentCount?: number;
    lastQuestionText?: string;
    correctPercentage?: number;
  };
}

export const PiPPresenterWidget = ({ initialData }: PiPPresenterWidgetProps) => {
  const [isRecording, setIsRecording] = useState(initialData?.isRecording ?? false);
  const [nextQuestionIn, setNextQuestionIn] = useState(initialData?.nextAutoQuestionIn ?? 0);
  const [studentCount, setStudentCount] = useState(initialData?.studentCount ?? 0);
  const [lastQuestionText, setLastQuestionText] = useState(initialData?.lastQuestionText ?? '');
  const [correctPercentage, setCorrectPercentage] = useState<number | null>(initialData?.correctPercentage ?? null);
  const [flashBorder, setFlashBorder] = useState(false);

  // Listen for broadcasts from main window
  usePresenterReceiver((message) => {
    console.log('PiP received broadcast:', message.type);
    
    switch (message.type) {
      case 'state_update':
        if (message.data.isRecording !== undefined) setIsRecording(message.data.isRecording);
        if (message.data.nextAutoQuestionIn !== undefined) setNextQuestionIn(message.data.nextAutoQuestionIn);
        if (message.data.studentCount !== undefined) setStudentCount(message.data.studentCount);
        break;
      case 'countdown_tick':
        if (message.data.nextAutoQuestionIn !== undefined) setNextQuestionIn(message.data.nextAutoQuestionIn);
        break;
      case 'question_sent':
        if (message.data.lastQuestionSent?.question) {
          setLastQuestionText(message.data.lastQuestionSent.question);
        }
        setCorrectPercentage(null);
        // Flash green border
        setFlashBorder(true);
        setTimeout(() => setFlashBorder(false), 1500);
        break;
      case 'recording_status':
        if (message.data.isRecording !== undefined) setIsRecording(message.data.isRecording);
        break;
    }
  });

  // Local countdown interpolation between broadcasts
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

  const getCountdownColor = () => {
    if (nextQuestionIn <= 10) return 'text-red-400';
    if (nextQuestionIn <= 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div 
      className={`
        w-full h-full bg-slate-900 text-white p-3 font-sans
        transition-all duration-300 select-none
        ${flashBorder ? 'ring-4 ring-emerald-400 ring-inset' : ''}
      `}
      style={{ minHeight: '100vh' }}
    >
      {/* Header with recording indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-400">RECORDING</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span className="text-xs font-medium text-slate-400">PAUSED</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{studentCount}</span>
        </div>
      </div>

      {/* Next question countdown - prominent */}
      <div className="bg-slate-800 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Next Question</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${getCountdownColor()}`}>
            {nextQuestionIn > 0 ? formatTime(nextQuestionIn) : '—:——'}
          </span>
        </div>
        {nextQuestionIn > 0 && (
          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 rounded-full ${
                nextQuestionIn <= 10 ? 'bg-red-500' : 
                nextQuestionIn <= 30 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (nextQuestionIn / 60) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Last question sent */}
      {lastQuestionText && (
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Last Sent</span>
          </div>
          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
            {lastQuestionText.length > 80 ? `${lastQuestionText.substring(0, 80)}...` : lastQuestionText}
          </p>
          {correctPercentage !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">{Math.round(correctPercentage)}% correct</span>
            </div>
          )}
        </div>
      )}

      {/* Edvana branding */}
      <div className="absolute bottom-2 right-2">
        <span className="text-[9px] text-slate-600 font-medium">EDVANA</span>
      </div>
    </div>
  );
};
