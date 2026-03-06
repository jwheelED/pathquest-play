import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Award,
  Clock,
  MessageSquare,
  Users,
  BookOpen,
  Sparkles,
  Star,
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Calendar,
} from "lucide-react";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { LectureSummaryData } from "./LectureSummarySheet";

interface SavedSummary {
  id: string;
  title: string | null;
  duration_seconds: number;
  questions_asked: number;
  student_count: number;
  summary_data: LectureSummaryData;
  created_at: string;
  course_id: string | null;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

export function SavedSummariesTab() {
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(null);
  const { selectedCourseId } = useCourseContext();

  useEffect(() => {
    fetchSummaries();
  }, [selectedCourseId]);

  const fetchSummaries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("lecture_summaries")
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSummaries(
        (data || []).map((s) => ({
          ...s,
          summary_data: s.summary_data as unknown as LectureSummaryData,
        }))
      );
    } catch (error) {
      console.error("Error fetching summaries:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("lecture_summaries").delete().eq("id", id);
      if (error) throw error;
      setSummaries((prev) => prev.filter((s) => s.id !== id));
      if (selectedSummary?.id === id) setSelectedSummary(null);
      toast.success("Summary deleted");
    } catch (error) {
      toast.error("Failed to delete summary");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="headspace-card rounded-2xl p-5 border border-border/50 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={<Award className="w-7 h-7" />}
        title="No saved summaries"
        description="Lecture summaries are generated after 10+ minute live sessions. Save them from the post-lecture summary sheet."
      />
    );
  }

  const summaryData = selectedSummary?.summary_data;

  return (
    <>
      <div className="space-y-3">
        {summaries.map((summary) => (
          <Card
            key={summary.id}
            className="headspace-card cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedSummary(summary)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm truncate">
                    {summary.title || "Untitled Summary"}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(summary.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuration(summary.duration_seconds)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {summary.questions_asked} questions
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {summary.student_count} students
                    </span>
                  </div>
                  {summary.summary_data?.topicsIdentified?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {summary.summary_data.topicsIdentified.slice(0, 4).map((topic, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                      {summary.summary_data.topicsIdentified.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{summary.summary_data.topicsIdentified.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(summary.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedSummary} onOpenChange={(open) => !open && setSelectedSummary(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              {selectedSummary?.title || "Lecture Summary"}
            </SheetTitle>
            <SheetDescription>
              {selectedSummary && format(new Date(selectedSummary.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-8rem)] pr-4">
            {summaryData && selectedSummary && (
              <div className="space-y-6">
                {/* Header Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-3 text-center">
                    <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-lg font-bold">{formatDuration(selectedSummary.duration_seconds)}</p>
                    <p className="text-xs text-muted-foreground">Duration</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-lg font-bold">{selectedSummary.questions_asked}</p>
                    <p className="text-xs text-muted-foreground">Questions</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-lg font-bold">{selectedSummary.student_count}</p>
                    <p className="text-xs text-muted-foreground">Students</p>
                  </Card>
                </div>

                {/* Check-In Performance */}
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
                          Number(summaryData.checkInResults.accuracy) >= 70 ? "text-success" 
                            : Number(summaryData.checkInResults.accuracy) >= 50 ? "text-warning" : "text-destructive"
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

                {/* Topics */}
                {summaryData.topicsIdentified?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Topics Covered
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {summaryData.topicsIdentified.map((t, i) => (
                          <Badge key={i} variant="secondary">{t}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Key Concepts */}
                {summaryData.keyConceptsCovered?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Key Concepts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {summaryData.keyConceptsCovered.map((c, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Highlights */}
                {summaryData.lectureHighlights?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Star className="h-4 w-4 text-warning" />
                        Highlights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {summaryData.lectureHighlights.map((h, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-warning mt-0.5">•</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Engagement */}
                {summaryData.engagementAnalysis && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Engagement Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{summaryData.engagementAnalysis}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Teaching Suggestions */}
                {summaryData.teachingSuggestions?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        Teaching Suggestions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {summaryData.teachingSuggestions.map((s, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Concepts to Review */}
                {summaryData.conceptsToReview?.length > 0 && (
                  <Card className="border-dashed border-primary/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        Consider Reviewing
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {summaryData.conceptsToReview.map((c, i) => (
                          <li key={i} className="text-sm flex items-start gap-2 bg-primary/5 p-2 rounded-lg">
                            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Separator className="my-4" />
                <p className="text-xs text-center text-muted-foreground pb-4">
                  Summary from {formatDuration(selectedSummary.duration_seconds)} of lecture content
                </p>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
