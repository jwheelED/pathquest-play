import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Mic,
  MicOff,
  Send,
  Clock,
  Users,
  Zap,
  ChevronUp,
  ChevronDown,
  FileQuestion,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SlideQuestionType = 'mcq' | 'short_answer' | 'coding';

interface SlideRecordingControlsProps {
  isRecording: boolean;
  recordingDuration: number;
  studentCount: number;
  autoQuestionEnabled: boolean;
  nextAutoQuestionIn: number;
  autoQuestionInterval: number;
  isSendingQuestion: boolean;
  voiceCommandDetected: boolean;
  isExtractingSlideQuestion?: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onManualSend: () => void;
  onToggleAutoQuestion: () => void;
  onTestAutoQuestion: () => void;
  onSendSlideQuestion?: (questionType: SlideQuestionType) => void;
}

export function SlideRecordingControls({
  isRecording,
  recordingDuration,
  studentCount,
  autoQuestionEnabled,
  nextAutoQuestionIn,
  autoQuestionInterval,
  isSendingQuestion,
  voiceCommandDetected,
  isExtractingSlideQuestion = false,
  onStartRecording,
  onStopRecording,
  onManualSend,
  onToggleAutoQuestion,
  onTestAutoQuestion,
  onSendSlideQuestion,
}: SlideRecordingControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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
    if (nextAutoQuestionIn <= 10) return 'text-red-400';
    if (nextAutoQuestionIn <= 30) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getProgressColor = () => {
    if (nextAutoQuestionIn <= 10) return 'bg-red-500';
    if (nextAutoQuestionIn <= 30) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const intervalSeconds = autoQuestionInterval * 60;
  const progressPercent = autoQuestionEnabled && nextAutoQuestionIn > 0
    ? ((intervalSeconds - nextAutoQuestionIn) / intervalSeconds) * 100
    : 0;

  // Minimized view
  if (!isExpanded) {
    return (
      <div
        className={cn(
          'absolute bottom-4 left-4 z-50 cursor-pointer transition-all duration-300',
          voiceCommandDetected && 'ring-4 ring-emerald-400 rounded-full'
        )}
        onClick={() => setIsExpanded(true)}
      >
        <div className="bg-slate-900/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-3">
          {isRecording ? (
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          ) : (
            <div className="w-3 h-3 rounded-full bg-slate-500" />
          )}
          {isRecording && (
            <span className="text-white/80 text-sm tabular-nums">{formatDuration(recordingDuration)}</span>
          )}
          {autoQuestionEnabled && nextAutoQuestionIn > 0 && (
            <span className={cn('text-sm font-bold tabular-nums', getCountdownColor())}>
              {formatTime(nextAutoQuestionIn)}
            </span>
          )}
          <div className="flex items-center gap-1 text-slate-400">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs">{studentCount}</span>
          </div>
          <ChevronUp className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute bottom-4 left-4 z-50 w-80 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden transition-all duration-300',
        voiceCommandDetected && 'ring-4 ring-emerald-400'
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-slate-800/50 cursor-pointer"
        onClick={() => setIsExpanded(false)}
      >
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-400">RECORDING</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span className="text-xs font-medium text-slate-400">READY</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRecording && (
            <span className="text-xs text-slate-400 tabular-nums">{formatDuration(recordingDuration)}</span>
          )}
          <div className="flex items-center gap-1 text-slate-400">
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs">{studentCount}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-4">
        {/* Recording Button */}
        <div className="flex gap-2">
          <Button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={cn(
              'flex-1 h-12',
              isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            )}
          >
            {isRecording ? (
              <>
                <MicOff className="w-5 h-5 mr-2" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </>
            )}
          </Button>
        </div>

        {/* Auto-Question Timer */}
        {isRecording && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">Auto-Question</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleAutoQuestion}
                  className="h-6 px-2 text-xs"
                >
                  {autoQuestionEnabled ? (
                    <Badge variant="default" className="bg-emerald-600 text-[10px]">ON</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">OFF</Badge>
                  )}
                </Button>
              </div>
              {autoQuestionEnabled && nextAutoQuestionIn > 0 && (
                <span className={cn('text-xl font-bold tabular-nums', getCountdownColor())}>
                  {formatTime(nextAutoQuestionIn)}
                </span>
              )}
            </div>

            {autoQuestionEnabled && (
              <>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                  <div
                    className={cn('h-full transition-all duration-1000 rounded-full', getProgressColor())}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Every {autoQuestionInterval} min</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTestAutoQuestion}
                    disabled={isSendingQuestion}
                    className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Test Now
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Manual Send Button */}
        {isRecording && (
          <Button
            onClick={onManualSend}
            disabled={isSendingQuestion}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSendingQuestion ? 'Sending...' : 'Send Question Now'}
          </Button>
        )}

        {/* Send Slide Question Button - always visible in presentation mode */}
        {onSendSlideQuestion && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={isExtractingSlideQuestion || isSendingQuestion}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white border-0"
              >
                {isExtractingSlideQuestion ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting Question...
                  </>
                ) : (
                  <>
                    <FileQuestion className="w-4 h-4 mr-2" />
                    Send Slide Question
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => onSendSlideQuestion('mcq')}>
                <span className="font-medium">Multiple Choice</span>
                <span className="ml-auto text-xs text-muted-foreground">MCQ</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSendSlideQuestion('short_answer')}>
                <span className="font-medium">Short Answer</span>
                <span className="ml-auto text-xs text-muted-foreground">Text</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSendSlideQuestion('coding')}>
                <span className="font-medium">Coding Challenge</span>
                <span className="ml-auto text-xs text-muted-foreground">Code</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Voice Command Hint */}
        {isRecording && (
          <div className="text-center">
            <p className="text-[10px] text-slate-500">
              Say "send question" to trigger voice command
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
