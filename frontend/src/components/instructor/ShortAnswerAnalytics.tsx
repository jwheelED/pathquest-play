import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, MessageSquare, Users, Sparkles, ThumbsUp, AlertCircle, Minus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface TopResponse {
  studentName: string;
  grade: number;
  answerSnippet: string;
  highlight: string;
}

interface ShortAnswerSummary {
  summary: string;
  trend: string;
  sentiment?: string;
  themes?: string[];
  topResponses?: TopResponse[];
  loading: boolean;
}

interface ShortAnswerAnalyticsProps {
  summary: ShortAnswerSummary | undefined;
  questionType: string;
}

export const ShortAnswerAnalytics = ({ summary, questionType }: ShortAnswerAnalyticsProps) => {
  const [expandedResponses, setExpandedResponses] = useState<Record<number, boolean>>({});

  if (!summary) {
    return (
      <div className="my-4 border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">AI Response Analysis</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Click "Generate Summary" to get AI-powered insights about student responses.
        </p>
      </div>
    );
  }

  if (summary.loading) {
    return (
      <div className="my-4 border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <p className="text-sm font-medium">Analyzing Responses...</p>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  // Parse sentiment from the sentiment string
  const getSentimentInfo = (sentimentText?: string) => {
    if (!sentimentText) return null;
    
    const lowerText = sentimentText.toLowerCase();
    if (lowerText.includes('positive')) {
      return { label: 'Positive', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: ThumbsUp };
    } else if (lowerText.includes('negative')) {
      return { label: 'Negative', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle };
    } else if (lowerText.includes('mixed')) {
      return { label: 'Mixed', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Minus };
    }
    return { label: 'Neutral', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: Minus };
  };

  const sentimentInfo = getSentimentInfo(summary.sentiment);

  const getGradeBadgeVariant = (grade: number): "default" | "secondary" | "destructive" | "outline" => {
    if (grade >= 90) return "default";
    if (grade >= 70) return "secondary";
    if (grade >= 50) return "outline";
    return "destructive";
  };

  const getGradeColor = (grade: number): string => {
    if (grade >= 90) return "text-green-600 dark:text-green-400";
    if (grade >= 70) return "text-blue-600 dark:text-blue-400";
    if (grade >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="my-4 border rounded-lg p-4 bg-gradient-to-br from-primary/5 to-primary/10 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">AI Response Analysis</p>
        </div>
        {sentimentInfo && (
          <Badge className={`gap-1 ${sentimentInfo.color}`}>
            <sentimentInfo.icon className="h-3 w-3" />
            {sentimentInfo.label} Sentiment
          </Badge>
        )}
      </div>

      {/* Summary & Trend */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm font-medium text-primary">{summary.summary}</p>
        </div>
        <div className="flex items-start gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">{summary.trend}</p>
        </div>
      </div>

      {/* Common Themes */}
      {summary.themes && summary.themes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Themes</p>
          <div className="flex flex-wrap gap-2">
            {summary.themes.map((theme, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {theme}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Top Performers */}
      {summary.topResponses && summary.topResponses.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-primary/20">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Top Performers</p>
            <Badge variant="secondary" className="text-xs">
              {summary.topResponses.length} best answers
            </Badge>
          </div>
          
          <div className="space-y-2">
            {summary.topResponses.map((response, idx) => (
              <Collapsible
                key={idx}
                open={expandedResponses[idx]}
                onOpenChange={(open) => setExpandedResponses(prev => ({ ...prev, [idx]: open }))}
              >
                <div className="border rounded-lg bg-background/80 overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-3 h-auto hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{response.studentName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getGradeBadgeVariant(response.grade)} className={getGradeColor(response.grade)}>
                          {response.grade}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {expandedResponses[idx] ? 'Hide' : 'View'} Answer
                        </span>
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
                      <div className="pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Student's Answer:</p>
                        <p className="text-sm bg-background p-2 rounded border italic">
                          "{response.answerSnippet}"
                        </p>
                      </div>
                      {response.highlight && (
                        <div className="flex items-start gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                          <Star className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{response.highlight}</span>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
