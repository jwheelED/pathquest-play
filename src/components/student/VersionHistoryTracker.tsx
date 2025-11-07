import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface VersionEvent {
  timestamp: Date;
  type: 'typed' | 'pasted' | 'deleted';
  content: string;
  charCount: number;
}

interface TabSwitch {
  left_at: string;
  returned_at: string;
  duration_seconds: number;
}

export interface VersionHistoryData {
  events: VersionEvent[];
  typed_count: number;
  pasted_count: number;
  question_displayed_at: Date;
  first_interaction_at: Date | null;
  first_interaction_type: string | null;
  first_interaction_size: number | null;
  question_copied: boolean;
  question_copied_at: Date | null;
  final_answer_length: number;
  editing_events_after_first_paste: number;
  tab_switch_count: number;
  total_time_away_seconds: number;
  tab_switches: TabSwitch[];
  longest_absence_seconds: number;
  switched_away_immediately: boolean;
  answer_copied: boolean;
  answer_copy_count: number;
  answer_copy_events: { timestamp: string; selectedText: string }[];
}

interface VersionHistoryTrackerProps {
  onVersionChange: (history: VersionHistoryData) => void;
  value: string;
  onChange: (value: string) => void;
  questionText?: string;
  isCodeEditor?: boolean;
}

export const VersionHistoryTracker = ({ onVersionChange, value, onChange, questionText, isCodeEditor = false }: VersionHistoryTrackerProps) => {
  const [versionHistory, setVersionHistory] = useState<VersionEvent[]>([]);
  const [isPasteDetected, setIsPasteDetected] = useState(false);
  const [questionCopied, setQuestionCopied] = useState(false);
  const [questionCopiedAt, setQuestionCopiedAt] = useState<Date | null>(null);
  const [questionDisplayedAt] = useState(new Date());
  const [firstInteractionAt, setFirstInteractionAt] = useState<Date | null>(null);
  const [firstInteractionType, setFirstInteractionType] = useState<string | null>(null);
  const [firstInteractionSize, setFirstInteractionSize] = useState<number | null>(null);
  const [firstPasteIndex, setFirstPasteIndex] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState<TabSwitch[]>([]);
  const [lastTabLeaveTime, setLastTabLeaveTime] = useState<Date | null>(null);
  const [answerCopyEvents, setAnswerCopyEvents] = useState<{ timestamp: string; selectedText: string }[]>([]);
  const lastValueRef = useRef(value);
  const lastTimestampRef = useRef(Date.now());

  // Component initialization logging
  useEffect(() => {
    console.log('🚀 [VersionTracker] Component initialized', {
      hasQuestionText: !!questionText,
      initialValue: value
    });
  }, []);

  // Track tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away from tab
        setLastTabLeaveTime(new Date());
      } else if (lastTabLeaveTime) {
        // User returned to tab
        const returnTime = new Date();
        const durationSeconds = Math.round((returnTime.getTime() - lastTabLeaveTime.getTime()) / 1000);
        
        setTabSwitches(prev => [...prev, {
          left_at: lastTabLeaveTime.toISOString(),
          returned_at: returnTime.toISOString(),
          duration_seconds: durationSeconds
        }]);
        setLastTabLeaveTime(null);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastTabLeaveTime]);

  useEffect(() => {
    const editingEventsAfterFirstPaste = firstPasteIndex !== null 
      ? versionHistory.slice(firstPasteIndex + 1).length 
      : 0;
    
    const totalTimeAwaySeconds = tabSwitches.reduce((sum, ts) => sum + ts.duration_seconds, 0);
    const longestAbsenceSeconds = tabSwitches.length > 0 
      ? Math.max(...tabSwitches.map(ts => ts.duration_seconds))
      : 0;
    
    const switchedAwayImmediately = tabSwitches.length > 0 && firstInteractionAt
      ? (new Date(tabSwitches[0].left_at).getTime() - questionDisplayedAt.getTime()) < 10000
      : false;
    
    const historyData: VersionHistoryData = {
      events: versionHistory,
      typed_count: versionHistory.filter(v => v.type === 'typed').length,
      pasted_count: versionHistory.filter(v => v.type === 'pasted').length,
      question_displayed_at: questionDisplayedAt,
      first_interaction_at: firstInteractionAt,
      first_interaction_type: firstInteractionType,
      first_interaction_size: firstInteractionSize,
      question_copied: questionCopied,
      question_copied_at: questionCopiedAt,
      final_answer_length: value.length,
      editing_events_after_first_paste: editingEventsAfterFirstPaste,
      tab_switch_count: tabSwitches.length,
      total_time_away_seconds: totalTimeAwaySeconds,
      tab_switches: tabSwitches,
      longest_absence_seconds: longestAbsenceSeconds,
      switched_away_immediately: switchedAwayImmediately,
      answer_copied: answerCopyEvents.length > 0,
      answer_copy_count: answerCopyEvents.length,
      answer_copy_events: answerCopyEvents,
    };
    
    console.log('📊 [VersionTracker] Calling onVersionChange with:', {
      typed_count: historyData.typed_count,
      pasted_count: historyData.pasted_count,
      total_events: versionHistory.length,
      has_data: versionHistory.length > 0
    });
    
    onVersionChange(historyData);
  }, [
    versionHistory, 
    questionCopied, 
    questionCopiedAt, 
    value, 
    tabSwitches, 
    firstInteractionAt,
    firstInteractionType,
    firstInteractionSize,
    firstPasteIndex,
    answerCopyEvents,
    questionDisplayedAt,
    onVersionChange
  ]);

  const addVersionEvent = (type: 'typed' | 'pasted' | 'deleted', content: string) => {
    const event: VersionEvent = {
      timestamp: new Date(),
      type,
      content: content.slice(-50), // Store last 50 chars for privacy
      charCount: content.length,
    };

    setVersionHistory(prev => {
      const newHistory = [...prev, event];
      
      // Track first interaction
      if (prev.length === 0) {
        setFirstInteractionAt(event.timestamp);
        setFirstInteractionType(type);
        setFirstInteractionSize(content.length);
      }
      
      // Track first paste for editing analysis
      if (type === 'pasted' && firstPasteIndex === null) {
        setFirstPasteIndex(newHistory.length - 1);
      }
      
      return newHistory;
    });
    
    if (type === 'pasted') {
      setIsPasteDetected(true);
      setTimeout(() => setIsPasteDetected(false), 3000);
    }
  };

  const handleQuestionCopy = () => {
    if (!questionCopied) {
      setQuestionCopied(true);
      setQuestionCopiedAt(new Date());
      setIsPasteDetected(true);
      setTimeout(() => setIsPasteDetected(false), 3000);
    }
  };

  const handleAnswerCopy = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const copiedText = window.getSelection()?.toString() || '';
    const copyEvent = {
      timestamp: new Date().toISOString(),
      selectedText: copiedText.slice(0, 50) // Store first 50 chars for privacy
    };
    
    setAnswerCopyEvents(prev => [...prev, copyEvent]);
    
    // Visual feedback
    setIsPasteDetected(true);
    setTimeout(() => setIsPasteDetected(false), 3000);
    
    console.log('⚠️ Student copied from answer box:', copiedText.length, 'characters');
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    console.log('📋 [VersionTracker] Paste event detected, length:', pastedText.length);
    addVersionEvent('pasted', pastedText);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTimestampRef.current;
    const lengthDiff = newValue.length - lastValueRef.current.length;

    // Detect typing vs pasting based on speed and volume
    if (lengthDiff > 10 && timeDiff < 100) {
      // Large change in short time = likely paste
      console.log('📋 [VersionTracker] Auto-detected paste (speed-based)');
      addVersionEvent('pasted', newValue);
    } else if (lengthDiff > 0) {
      console.log('⌨️  [VersionTracker] Typed event detected');
      addVersionEvent('typed', newValue);
    } else if (lengthDiff < 0) {
      addVersionEvent('deleted', newValue);
    }

    lastValueRef.current = newValue;
    lastTimestampRef.current = currentTime;
    onChange(newValue);
  };

  const getTypedVsPastedStats = () => {
    const typed = versionHistory.filter(v => v.type === 'typed').length;
    const pasted = versionHistory.filter(v => v.type === 'pasted').length;
    const total = typed + pasted;
    return { typed, pasted, total, typedPercentage: total > 0 ? (typed / total) * 100 : 0 };
  };

  const stats = getTypedVsPastedStats();

  return (
    <div className="space-y-4">
      {questionText && (
        <div 
          onCopy={handleQuestionCopy}
          className="p-4 bg-muted rounded-lg border"
        >
          <p className="text-sm font-medium mb-2">Question:</p>
          <p className="text-sm">{questionText}</p>
        </div>
      )}
      
      <textarea
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onCopy={handleAnswerCopy}
        className={`w-full p-4 border rounded-lg text-sm resize-y ${
          isCodeEditor 
            ? 'font-mono bg-slate-950 text-slate-100 dark:bg-slate-900 min-h-[300px] leading-relaxed' 
            : 'font-mono min-h-[200px]'
        }`}
        placeholder={isCodeEditor ? "# Write your code here...\n\ndef solution():\n    pass" : "Type your answer here..."}
        spellCheck={!isCodeEditor}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Version History Tracking
            {isPasteDetected && (
              <Badge variant="destructive" className="ml-2">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Paste Detected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.typed}</p>
              <p className="text-xs text-muted-foreground">Typed Events</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{stats.pasted}</p>
              <p className="text-xs text-muted-foreground">Paste Events</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.typedPercentage.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Original Work</p>
            </div>
          </div>

          {versionHistory.length > 0 && (
            <div className="mt-4 max-h-32 overflow-y-auto border-t pt-2">
              <p className="text-xs font-medium mb-2">Recent Activity:</p>
              {versionHistory.slice(-5).reverse().map((event, idx) => (
                <div key={idx} className="text-xs flex items-center gap-2 py-1">
                  {event.type === 'typed' && <CheckCircle className="h-3 w-3 text-green-600" />}
                  {event.type === 'pasted' && <AlertTriangle className="h-3 w-3 text-orange-600" />}
                  <span className="text-muted-foreground">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                  <Badge variant={event.type === 'pasted' ? 'destructive' : 'secondary'} className="text-xs">
                    {event.type}
                  </Badge>
                </div>
              ))}
              {questionCopied && (
                <div className="text-xs flex items-center gap-2 py-1 border-t pt-2 mt-2">
                  <AlertTriangle className="h-3 w-3 text-orange-600" />
                  <span className="text-muted-foreground">
                    Question copied at {questionCopiedAt?.toLocaleTimeString()}
                  </span>
                </div>
              )}
              {answerCopyEvents.length > 0 && (
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-medium text-orange-600 mb-1">
                    ⚠️ Answer copied {answerCopyEvents.length} time(s)
                  </p>
                  {answerCopyEvents.slice(-3).map((event, idx) => (
                    <div key={idx} className="text-xs flex items-center gap-2 py-1">
                      <AlertTriangle className="h-3 w-3 text-orange-600" />
                      <span className="text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({event.selectedText.length} chars)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
