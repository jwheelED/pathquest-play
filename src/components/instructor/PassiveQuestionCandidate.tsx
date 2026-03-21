import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PassiveQuestionCandidate as CandidateType } from '@/hooks/usePassiveQuestionDetection';

interface PassiveQuestionCandidateProps {
  candidate: CandidateType;
  onSend: (questionText: string) => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function PassiveQuestionCandidateCard({
  candidate,
  onSend,
  onDismiss,
  autoDismissMs = 15000,
}: PassiveQuestionCandidateProps) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Countdown progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - candidate.detectedAt;
      const remaining = Math.max(0, 1 - elapsed / autoDismissMs) * 100;
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [candidate.detectedAt, autoDismissMs]);

  return (
    <div
      className={cn(
        'fixed bottom-20 right-4 z-[60] w-80 transition-all duration-300 ease-out',
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0'
      )}
    >
      <Card className="bg-card border-primary/30 shadow-xl overflow-hidden">
        {/* Auto-dismiss progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-3 space-y-2.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary">Question Detected</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">Auto</Badge>
          </div>

          {/* Question text */}
          <p className="text-sm text-foreground leading-snug line-clamp-3">
            "{candidate.text}"
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onSend(candidate.text)}
              className="flex-1 h-8 text-xs"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send to Students
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
