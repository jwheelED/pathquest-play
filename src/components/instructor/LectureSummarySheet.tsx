import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Award,
  Clock,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Lightbulb,
  RefreshCw,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";

export interface LectureSummaryData {
  topicsIdentified: string[];
  keyConceptsCovered: string[];
  engagementAnalysis: string;
  teachingSuggestions: string[];
  conceptsToReview: string[];
  lectureHighlights: string[];
  durationMinutes?: number;
  questionsAsked?: number;
  checkInResults?: {
    total: number;
    correct: number;
    accuracy: number;
  };
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

              {/* Student Check-In Performance */}
              {summaryData.checkInResults && summaryData.checkInResults.total > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Student Check-In Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Overall Accuracy</span>
                      <span className={`font-bold ${
                        Number(summaryData.checkInResults.accuracy) >= 70 
                          ? "text-green-600" 
                          : Number(summaryData.checkInResults.accuracy) >= 50 
                            ? "text-yellow-600" 
                            : "text-red-600"
                      }`}>
                        {summaryData.checkInResults.accuracy}%
                      </span>
                    </div>
                    <Progress value={Number(summaryData.checkInResults.accuracy)} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {summaryData.checkInResults.correct} of {summaryData.checkInResults.total} responses correct
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Topics Covered */}
              {summaryData.topicsIdentified && summaryData.topicsIdentified.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Topics Covered
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {summaryData.topicsIdentified.map((topic, i) => (
                        <Badge key={i} variant="secondary">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Concepts */}
              {summaryData.keyConceptsCovered && summaryData.keyConceptsCovered.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Key Concepts Covered
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.keyConceptsCovered.map((concept, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          {concept}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Lecture Highlights */}
              {summaryData.lectureHighlights && summaryData.lectureHighlights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Lecture Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.lectureHighlights.map((highlight, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-yellow-500 mt-0.5">•</span>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Engagement Analysis */}
              {summaryData.engagementAnalysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Engagement Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {summaryData.engagementAnalysis}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Teaching Suggestions */}
              {summaryData.teachingSuggestions && summaryData.teachingSuggestions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      Teaching Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.teachingSuggestions.map((suggestion, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Concepts to Review */}
              {summaryData.conceptsToReview && summaryData.conceptsToReview.length > 0 && (
                <Card className="border-dashed border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      Consider Reviewing
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summaryData.conceptsToReview.map((concept, i) => (
                        <li key={i} className="text-sm flex items-start gap-2 bg-primary/5 p-2 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                          {concept}
                        </li>
                      ))}
                    </ul>
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
