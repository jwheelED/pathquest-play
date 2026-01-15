import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Lightbulb,
  RefreshCw,
  Download,
  X,
  Loader2,
} from "lucide-react";

export interface LectureSummaryData {
  overallScore: number;
  summary: string;
  transcriptInsights: {
    avgPaceWPM: number;
    topicsCovered: string[];
    complexSections: Array<{ timestamp: string; topic: string }>;
    coverageGaps?: string[];
  };
  studentInsights: {
    overallAccuracy: number;
    totalResponses: number;
    strugglingQuestions: Array<{ question: string; accuracy: number }>;
    commonMisconceptions: string[];
    sentiment?: string;
  };
  recommendations: string[];
  reteachingSuggestions: Array<{ topic: string; reason: string }>;
}

interface LectureSummarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summaryData: LectureSummaryData | null;
  isLoading: boolean;
  recordingDuration: number;
  questionsAsked: number;
  studentCount: number;
  onExport?: () => void;
}

const getScoreColor = (score: number) => {
  if (score >= 8) return "text-green-600";
  if (score >= 6) return "text-yellow-600";
  return "text-red-600";
};

const getScoreLabel = (score: number) => {
  if (score >= 9) return "Excellent";
  if (score >= 8) return "Great";
  if (score >= 7) return "Good";
  if (score >= 6) return "Fair";
  if (score >= 5) return "Needs Work";
  return "Challenging";
};

const getPaceStatus = (wpm: number) => {
  if (wpm >= 120 && wpm <= 150) return { label: "Ideal", color: "text-green-600" };
  if (wpm < 100) return { label: "Slow", color: "text-yellow-600" };
  if (wpm > 170) return { label: "Fast", color: "text-red-600" };
  return { label: "Acceptable", color: "text-muted-foreground" };
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

export const LectureSummarySheet = ({
  open,
  onOpenChange,
  summaryData,
  isLoading,
  recordingDuration,
  questionsAsked,
  studentCount,
}: LectureSummarySheetProps) => {
  const paceStatus = summaryData ? getPaceStatus(summaryData.transcriptInsights.avgPaceWPM) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Teaching Summary
            </SheetTitle>
          </div>
          <SheetDescription>
            Post-lecture analysis and teaching insights
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Analyzing your lecture...</p>
              <p className="text-sm text-muted-foreground text-center">
                We're reviewing the transcript and student responses to generate insights.
              </p>
            </div>
          ) : summaryData ? (
            <div className="space-y-6">
              {/* Header Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{formatDuration(recordingDuration)}</p>
                  <p className="text-xs text-muted-foreground">Duration</p>
                </Card>
                <Card className="p-3 text-center">
                  <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{questionsAsked}</p>
                  <p className="text-xs text-muted-foreground">Questions</p>
                </Card>
                <Card className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{studentCount}</p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </Card>
              </div>

              {/* Overall Score */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Overall Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className={`text-4xl font-bold ${getScoreColor(summaryData.overallScore)}`}>
                      {summaryData.overallScore}/10
                    </div>
                    <div className="flex-1">
                      <Badge variant="secondary" className="mb-2">
                        {getScoreLabel(summaryData.overallScore)}
                      </Badge>
                      <Progress value={summaryData.overallScore * 10} className="h-2" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {summaryData.summary}
                  </p>
                </CardContent>
              </Card>

              {/* Student Performance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Student Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Overall Accuracy</span>
                    <span className={`font-bold ${
                      summaryData.studentInsights.overallAccuracy >= 70 
                        ? "text-green-600" 
                        : summaryData.studentInsights.overallAccuracy >= 50 
                          ? "text-yellow-600" 
                          : "text-red-600"
                    }`}>
                      {summaryData.studentInsights.overallAccuracy}%
                    </span>
                  </div>
                  <Progress value={summaryData.studentInsights.overallAccuracy} className="h-2" />
                  
                  {summaryData.studentInsights.strugglingQuestions.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium flex items-center gap-1 mb-2">
                        <AlertTriangle className="h-3 w-3 text-yellow-600" />
                        Areas Students Struggled
                      </p>
                      <div className="space-y-2">
                        {summaryData.studentInsights.strugglingQuestions.map((q, i) => (
                          <div key={i} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                            <span className="truncate flex-1">{q.question}...</span>
                            <Badge variant="outline" className="ml-2 shrink-0">
                              {q.accuracy}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Speaking Pace */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Speaking Pace
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {summaryData.transcriptInsights.avgPaceWPM} WPM
                    </span>
                    {paceStatus && (
                      <Badge variant="secondary" className={paceStatus.color}>
                        {paceStatus.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ideal range: 120-150 words per minute
                  </p>
                </CardContent>
              </Card>

              {/* Topics Covered */}
              {summaryData.transcriptInsights.topicsCovered.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Topics Covered
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {summaryData.transcriptInsights.topicsCovered.map((topic, i) => (
                        <Badge key={i} variant="secondary">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Common Misconceptions */}
              {summaryData.studentInsights.commonMisconceptions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      Potential Misconceptions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.studentInsights.commonMisconceptions.map((item, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-yellow-600 mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Recommendations */}
              {summaryData.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Re-teaching Suggestions */}
              {summaryData.reteachingSuggestions.length > 0 && (
                <Card className="border-dashed border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      Consider Re-teaching
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summaryData.reteachingSuggestions.map((item, i) => (
                        <div key={i} className="bg-primary/5 p-3 rounded-lg">
                          <p className="font-medium text-sm">{item.topic}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator className="my-4" />

              {/* Footer hint */}
              <p className="text-xs text-center text-muted-foreground pb-4">
                Summary generated based on {formatDuration(recordingDuration)} of lecture content
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <AlertTriangle className="h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No summary available</p>
              <p className="text-sm text-muted-foreground text-center">
                Record at least 10 minutes of lecture content to generate a teaching summary.
              </p>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
