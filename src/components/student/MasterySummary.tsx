import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, AlertTriangle, Clock, BookOpen, 
  Trophy, Target, RefreshCw, Download, ChevronRight,
  Brain, Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MasteredConcept {
  name: string;
  strengthScore: number;
}

interface WeakConcept {
  name: string;
  strengthScore: number;
  errorPatterns: string[];
}

interface RecommendedRewatch {
  timestamp: number;
  endTimestamp: number;
  concept: string;
  reason: string;
}

interface MasterySummaryData {
  masteredConcepts: MasteredConcept[];
  weakConcepts: WeakConcept[];
  recommendedRewatches: RecommendedRewatch[];
  overallScore: number;
  totalPoints: number;
  questionsAnswered: number;
  correctAnswers: number;
}

interface MasterySummaryProps {
  lectureId: string;
  lectureTitle: string;
  totalPoints: number;
  questionsAnswered: number;
  correctAnswers: number;
  pausePoints: Array<{
    id: string;
    pause_timestamp: number;
    question_content: { question: string };
  }>;
  responses: Record<string, { correct: boolean; answer: string }>;
  onRewatch?: (timestamp: number) => void;
  onStartReview?: () => void;
  onContinue?: () => void;
}

export const MasterySummary = ({
  lectureId,
  lectureTitle,
  totalPoints,
  questionsAnswered,
  correctAnswers,
  pausePoints,
  responses,
  onRewatch,
  onStartReview,
  onContinue
}: MasterySummaryProps) => {
  const [summaryData, setSummaryData] = useState<MasterySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const overallScore = questionsAnswered > 0 
    ? Math.round((correctAnswers / questionsAnswered) * 100) 
    : 0;

  useEffect(() => {
    generateMasterySummary();
  }, [lectureId]);

  const generateMasterySummary = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lecture-mastery-summary', {
        body: {
          lectureId,
          responses,
          pausePoints: pausePoints.map(p => ({
            id: p.id,
            timestamp: p.pause_timestamp,
            question: p.question_content.question
          }))
        }
      });

      if (error) throw error;

      setSummaryData({
        ...data,
        overallScore,
        totalPoints,
        questionsAnswered,
        correctAnswers
      });
    } catch (error) {
      console.error('Failed to generate mastery summary:', error);
      // Fallback to basic summary
      setSummaryData({
        masteredConcepts: [],
        weakConcepts: [],
        recommendedRewatches: [],
        overallScore,
        totalPoints,
        questionsAnswered,
        correctAnswers
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportAnki = async () => {
    setExporting(true);
    try {
      // Generate Anki-compatible CSV
      const weakConcepts = summaryData?.weakConcepts || [];
      const incorrectQuestions = pausePoints.filter(p => responses[p.id] && !responses[p.id].correct);
      
      let csv = 'front,back,tags\n';
      incorrectQuestions.forEach(q => {
        const question = q.question_content.question.replace(/"/g, '""');
        const tags = `lecture::${lectureTitle.replace(/\s+/g, '_')} status::needs_review`;
        csv += `"${question}","Review this concept","${tags}"\n`;
      });

      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lectureTitle.replace(/\s+/g, '_')}_review_cards.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Exported review cards for Anki!');
    } catch (error) {
      toast.error('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="py-12 flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Analyzing your performance...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center border-b">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy className="h-8 w-8 text-amber-500" />
          <CardTitle className="text-2xl">Lecture Complete!</CardTitle>
        </div>
        <p className="text-muted-foreground">{lectureTitle}</p>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Score Overview */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 rounded-lg bg-primary/10">
            <div className="text-3xl font-bold text-primary">{overallScore}%</div>
            <div className="text-sm text-muted-foreground">Overall Score</div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10">
            <div className="text-3xl font-bold text-emerald-500">{totalPoints}</div>
            <div className="text-sm text-muted-foreground">Points Earned</div>
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10">
            <div className="text-3xl font-bold text-amber-500">{correctAnswers}/{questionsAnswered}</div>
            <div className="text-sm text-muted-foreground">Correct</div>
          </div>
        </div>

        {/* Mastered Concepts */}
        {summaryData?.masteredConcepts && summaryData.masteredConcepts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h3 className="font-semibold">Concepts Mastered ({summaryData.masteredConcepts.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {summaryData.masteredConcepts.map((concept, idx) => (
                <Badge key={idx} variant="secondary" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {concept.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Weak Concepts */}
        {summaryData?.weakConcepts && summaryData.weakConcepts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Needs Review ({summaryData.weakConcepts.length})</h3>
            </div>
            <div className="space-y-2">
              {summaryData.weakConcepts.map((concept, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{concept.name}</span>
                    <Badge variant="outline" className="text-amber-600">
                      {Math.round(concept.strengthScore * 100)}% mastery
                    </Badge>
                  </div>
                  <Progress value={concept.strengthScore * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Rewatches */}
        {summaryData?.recommendedRewatches && summaryData.recommendedRewatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Recommended Rewatches</h3>
            </div>
            <div className="space-y-2">
              {summaryData.recommendedRewatches.map((rewatch, idx) => (
                <button
                  key={idx}
                  onClick={() => onRewatch?.(rewatch.timestamp)}
                  className="w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-16 h-10 rounded bg-primary/10 flex items-center justify-center text-sm font-mono">
                    {formatTime(rewatch.timestamp)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{rewatch.concept}</p>
                    <p className="text-sm text-muted-foreground truncate">{rewatch.reason}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {summaryData?.weakConcepts && summaryData.weakConcepts.length > 0 && (
            <Button onClick={onStartReview} className="w-full" size="lg">
              <Brain className="h-4 w-4 mr-2" />
              Start Review Quiz
            </Button>
          )}
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportAnki}
              disabled={exporting}
              className="flex-1"
            >
              {exporting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export to Anki
            </Button>
            <Button
              variant="outline"
              onClick={onContinue}
              className="flex-1"
            >
              <ChevronRight className="h-4 w-4 mr-2" />
              Continue
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
