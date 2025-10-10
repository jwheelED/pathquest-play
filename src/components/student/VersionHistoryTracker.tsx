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

interface VersionHistoryTrackerProps {
  onVersionChange: (history: VersionEvent[]) => void;
  value: string;
  onChange: (value: string) => void;
}

export const VersionHistoryTracker = ({ onVersionChange, value, onChange }: VersionHistoryTrackerProps) => {
  const [versionHistory, setVersionHistory] = useState<VersionEvent[]>([]);
  const [isPasteDetected, setIsPasteDetected] = useState(false);
  const lastValueRef = useRef(value);
  const lastTimestampRef = useRef(Date.now());

  useEffect(() => {
    onVersionChange(versionHistory);
  }, [versionHistory]);

  const addVersionEvent = (type: 'typed' | 'pasted' | 'deleted', content: string) => {
    const event: VersionEvent = {
      timestamp: new Date(),
      type,
      content: content.slice(-50), // Store last 50 chars for privacy
      charCount: content.length,
    };

    setVersionHistory(prev => [...prev, event]);
    
    if (type === 'pasted') {
      setIsPasteDetected(true);
      setTimeout(() => setIsPasteDetected(false), 3000);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
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
      addVersionEvent('pasted', newValue);
    } else if (lengthDiff > 0) {
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
      <textarea
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        className="w-full min-h-[200px] p-4 border rounded-lg font-mono text-sm"
        placeholder="Type your answer here..."
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};