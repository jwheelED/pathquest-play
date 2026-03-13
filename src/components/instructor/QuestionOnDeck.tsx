import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles,
  Send,
  Pause,
  Play,
  Pencil,
  Eye,
  Loader2,
  Radio,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PassiveQuestionCandidate } from '@/hooks/usePassiveQuestionDetection';

interface QuestionOnDeckProps {
  /** Current autodrafted candidate from passive detection or auto-interval */
  candidate: PassiveQuestionCandidate | null;
  /** Whether the system is actively recording/listening */
  isListening: boolean;
  /** Whether a question is currently being sent */
  isSending: boolean;
  /** Called when user clicks Send Now */
  onSendNow: (questionText: string) => void;
  /** Called when user clicks Preview (opens Review Audience Check modal) */
  onPreview: (questionText: string) => void;
  /** Called to dismiss/clear the current candidate */
  onDismiss: () => void;
  /** Whether hold is active (prevents auto-update of the draft) */
  isHeld: boolean;
  /** Toggle hold state */
  onToggleHold: () => void;
  /** Suggested question type */
  suggestedType?: 'multiple_choice' | 'short_answer';
}

export function QuestionOnDeck({
  candidate,
  isListening,
  isSending,
  onSendNow,
  onPreview,
  onDismiss,
  isHeld,
  onToggleHold,
  suggestedType = 'multiple_choice',
}: QuestionOnDeckProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const hasCandidate = !!candidate;

  const handleStartEdit = () => {
    if (candidate) {
      setEditText(candidate.text);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    // Send with edited text
    if (editText.trim()) {
      onSendNow(editText.trim());
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-500',
        hasCandidate
          ? 'border-primary/40 shadow-lg bg-gradient-to-br from-primary/[0.03] to-transparent'
          : 'border-border/60 bg-card/80'
      )}
    >
      {/* Top accent bar */}
      <div
        className={cn(
          'h-1 transition-all duration-700',
          hasCandidate
            ? 'bg-gradient-to-r from-primary via-primary/80 to-secondary'
            : isListening
              ? 'bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/30 to-muted-foreground/20 animate-pulse'
              : 'bg-muted'
        )}
      />

      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
                hasCandidate
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Question on Deck
              </h3>
              <p className="text-xs text-muted-foreground">
                {hasCandidate
                  ? 'Ready to send'
                  : isListening
                    ? 'Listening for your next question...'
                    : 'Start recording to autodraft'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasCandidate && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium border-primary/30 text-primary"
              >
                {suggestedType === 'multiple_choice' ? 'MCQ' : 'Short Answer'}
              </Badge>
            )}
            {isHeld && (
              <Badge
                variant="secondary"
                className="text-[10px] font-medium"
              >
                <Pause className="h-2.5 w-2.5 mr-0.5" />
                Held
              </Badge>
            )}
            {isListening && !hasCandidate && (
              <div className="flex items-center gap-1.5">
                <Radio className="h-3 w-3 text-primary animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium">Live</span>
              </div>
            )}
          </div>
        </div>

        {/* Question Content */}
        {hasCandidate && !isEditing ? (
          <div className="space-y-4">
            {/* Question text */}
            <div className="p-4 rounded-xl bg-background border border-border/60">
              <p className="text-sm text-foreground leading-relaxed">
                "{candidate.text}"
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onPreview(candidate.text)}
                variant="outline"
                className="gap-1.5 text-xs h-9 rounded-lg flex-1"
                disabled={isSending}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Button>

              <Button
                size="sm"
                onClick={() => onSendNow(candidate.text)}
                className="gap-1.5 text-xs h-9 rounded-lg flex-[2] bg-primary hover:bg-primary/90"
                disabled={isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send Now
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleHold}
                className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                title={isHeld ? 'Release hold' : 'Hold this draft'}
              >
                {isHeld ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleStartEdit}
                className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                title="Edit draft"
                disabled={isSending}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="gap-1 text-xs h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                title="Dismiss"
                disabled={isSending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="Edit the question..."
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="gap-1.5 text-xs h-8"
                disabled={!editText.trim()}
              >
                <Check className="h-3.5 w-3.5" />
                Send Edited
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                className="text-xs h-8"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* Empty / Listening state */
          <div className="py-6 text-center">
            <div
              className={cn(
                'mx-auto mb-3 h-12 w-12 rounded-2xl flex items-center justify-center transition-all',
                isListening
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isListening ? (
                <Radio className="h-5 w-5 animate-pulse" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isListening
                ? 'Edvana is listening and will autodraft your next audience check...'
                : 'Start recording to enable always-on question detection'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
