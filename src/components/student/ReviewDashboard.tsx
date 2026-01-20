import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, Brain, Target, RefreshCw, Play, AlertTriangle,
  BookOpen, TrendingDown, Sparkles, CheckCircle2, ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ConceptToReview {
  name: string;
  reason: 'spaced_repetition' | 'weak_mastery';
  strengthScore: number;
  lastPracticedAt?: string;
  masteryLevel?: string;
  relatedLectures: string[];
}

interface ErrorPattern {
  errorType: string;
  conceptA: string;
  conceptB?: string;
  occurrenceCount: number;
}

interface ReviewQuestion {
  id: string;
  question: string;
  type: string;
  difficulty: string;
  topicTags: string[];
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

interface RemediationSet {
  id: string;
  generatedAt: string;
  estimatedMinutes: number;
  conceptsToReview: ConceptToReview[];
  errorPatternsToAddress: ErrorPattern[];
  questions: ReviewQuestion[];
  stats: {
    totalConceptsDue: number;
    totalWeakConcepts: number;
    totalUnresolvedErrors: number;
    questionCount: number;
  };
}

interface ReviewDashboardProps {
  userId: string;
  onStartReview?: (questions: ReviewQuestion[]) => void;
}

export const ReviewDashboard = ({ userId, onStartReview }: ReviewDashboardProps) => {
  const [remediationSet, setRemediationSet] = useState<RemediationSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDailyRemediation();
  }, [userId]);

  const fetchDailyRemediation = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-remediation');

      if (error) throw error;

      setRemediationSet(data);
    } catch (error: any) {
      console.error('Failed to fetch daily remediation:', error);
      // Don't show error toast, just show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'spaced_repetition':
        return { label: 'Due for review', icon: Clock, color: 'text-primary' };
      case 'weak_mastery':
        return { label: 'Needs practice', icon: TrendingDown, color: 'text-amber-500' };
      default:
        return { label: 'Review', icon: Brain, color: 'text-muted-foreground' };
    }
  };

  const getErrorTypeLabel = (errorType: string) => {
    switch (errorType) {
      case 'confusion_between':
        return 'Confusion between concepts';
      case 'reversed_causality':
        return 'Cause-effect reversal';
      case 'incomplete_understanding':
        return 'Incomplete understanding';
      case 'overgeneralization':
        return 'Overgeneralization';
      default:
        return errorType;
    }
  };

  const handleStartReview = () => {
    if (remediationSet?.questions && remediationSet.questions.length > 0) {
      onStartReview?.(remediationSet.questions);
      toast.success('Starting review session!');
    } else {
      toast.info('No review questions available right now.');
    }
  };

  if (loading) {
    return (
      <Card className="headspace-card">
        <CardContent className="py-8 flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your review...</p>
        </CardContent>
      </Card>
    );
  }

  // Check if there's anything to review
  const hasContent = remediationSet && (
    remediationSet.conceptsToReview.length > 0 ||
    remediationSet.errorPatternsToAddress.length > 0 ||
    remediationSet.questions.length > 0
  );

  if (!hasContent) {
    return (
      <Card className="headspace-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <CardTitle className="text-lg">You're All Caught Up!</CardTitle>
              <p className="text-sm text-muted-foreground">
                No reviews due today. Keep learning!
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="headspace-card overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-amber-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Today's Review</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Est. {remediationSet?.estimatedMinutes || 5} min</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchDailyRemediation(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-primary/5">
            <div className="text-lg font-bold text-primary">
              {remediationSet?.stats.totalConceptsDue || 0}
            </div>
            <div className="text-xs text-muted-foreground">Due</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/5">
            <div className="text-lg font-bold text-amber-500">
              {remediationSet?.stats.totalWeakConcepts || 0}
            </div>
            <div className="text-xs text-muted-foreground">Weak</div>
          </div>
          <div className="p-2 rounded-lg bg-red-500/5">
            <div className="text-lg font-bold text-red-500">
              {remediationSet?.stats.totalUnresolvedErrors || 0}
            </div>
            <div className="text-xs text-muted-foreground">Errors</div>
          </div>
        </div>

        {/* Concepts to Review */}
        {remediationSet?.conceptsToReview && remediationSet.conceptsToReview.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Concepts to Review
            </h4>
            <div className="space-y-2">
              {remediationSet.conceptsToReview.slice(0, 4).map((concept, idx) => {
                const reasonInfo = getReasonLabel(concept.reason);
                const ReasonIcon = reasonInfo.icon;
                return (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ReasonIcon className={cn("h-4 w-4 flex-shrink-0", reasonInfo.color)} />
                      <span className="text-sm font-medium truncate">{concept.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={concept.strengthScore * 100} 
                        className="w-16 h-1.5" 
                      />
                      <span className="text-xs text-muted-foreground w-8">
                        {Math.round(concept.strengthScore * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {remediationSet.conceptsToReview.length > 4 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{remediationSet.conceptsToReview.length - 4} more concepts
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error Patterns */}
        {remediationSet?.errorPatternsToAddress && remediationSet.errorPatternsToAddress.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Patterns to Address
            </h4>
            <div className="space-y-1">
              {remediationSet.errorPatternsToAddress.slice(0, 2).map((error, idx) => (
                <div 
                  key={idx}
                  className="p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm"
                >
                  <span className="text-amber-700 dark:text-amber-400">
                    {getErrorTypeLabel(error.errorType)}
                  </span>
                  {error.conceptB ? (
                    <span className="text-muted-foreground">
                      : {error.conceptA} vs {error.conceptB}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">: {error.conceptA}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button 
          onClick={handleStartReview}
          className="w-full"
          size="lg"
          disabled={!remediationSet?.questions || remediationSet.questions.length === 0}
        >
          <Play className="h-4 w-4 mr-2" />
          Start Review ({remediationSet?.stats.questionCount || 0} questions)
        </Button>
      </CardContent>
    </Card>
  );
};
