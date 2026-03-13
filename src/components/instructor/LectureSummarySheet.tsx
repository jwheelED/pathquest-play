import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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
  Save,
  Check,
  FileDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCourseContext } from "@/hooks/useCourseContext";
import { format } from "date-fns";
import jsPDF from "jspdf";

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
  sessionId?: string | null;
  onExport?: () => void;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const generateTitle = (summaryData: LectureSummaryData): string => {
  const dateStr = format(new Date(), "MMM d");
  const topics = summaryData.topicsIdentified || [];
  if (topics.length >= 2) {
    const title = `${topics[0]} & ${topics[1]} — ${dateStr}`;
    return title.length > 60 ? `${topics[0]} — ${dateStr}` : title;
  }
  if (topics.length === 1) return `${topics[0]} — ${dateStr}`;
  return `Session Insight — ${dateStr}`;
};

const getAccuracyLabel = (accuracy: number): { label: string; icon: typeof TrendingUp } => {
  if (accuracy >= 70) return { label: "Strong understanding", icon: TrendingUp };
  if (accuracy >= 50) return { label: "Mixed results — consider review", icon: AlertTriangle };
  return { label: "Participants struggled — review recommended", icon: TrendingDown };
};

export const LectureSummarySheet = ({
  open,
  onOpenChange,
  summaryData,
  isLoading,
  recordingDuration,
  questionsAsked,
  studentCount,
  sessionId,
}: LectureSummarySheetProps) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { selectedCourseId } = useCourseContext();

  const reportTitle = summaryData ? generateTitle(summaryData) : "Session Insight";

  const handleSave = async () => {
    if (!summaryData) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("lecture_summaries").insert({
        instructor_id: user.id,
        session_id: sessionId || null,
        course_id: selectedCourseId || null,
        title: reportTitle,
        duration_seconds: recordingDuration,
        questions_asked: questionsAsked,
        student_count: studentCount,
        summary_data: summaryData as unknown as Record<string, unknown>,
      } as never);

      if (error) throw error;
      setSaved(true);
      toast.success("Session insight saved!");
    } catch (error) {
      console.error("Error saving summary:", error);
      toast.error("Failed to save session insight");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!summaryData) return;
    const doc = new jsPDF();
    let y = 20;
    const lm = 15;
    const pw = 180;

    doc.setFontSize(18);
    doc.text(reportTitle, lm, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`${formatDuration(recordingDuration)} · ${questionsAsked} questions · ${studentCount} participants · ${format(new Date(), "MMM d, yyyy")}`, lm, y);
    y += 12;
    doc.setTextColor(0);

    const addSection = (title: string, items: string[], bullet = "•") => {
      if (items.length === 0) return;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title, lm, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      items.forEach((item) => {
        const lines = doc.splitTextToSize(`${bullet} ${item}`, pw);
        if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, lm + 3, y);
        y += lines.length * 5 + 2;
      });
      y += 4;
    };

    if (summaryData.checkInResults && summaryData.checkInResults.total > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Class Performance", lm, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Overall accuracy: ${summaryData.checkInResults.accuracy}% (${summaryData.checkInResults.correct}/${summaryData.checkInResults.total} correct)`, lm + 3, y);
      y += 10;
    }

    addSection("Topics Covered", summaryData.topicsIdentified);
    addSection("Key Concepts", summaryData.keyConceptsCovered, "✓");
    addSection("Lecture Highlights", summaryData.lectureHighlights);
    if (summaryData.engagementAnalysis) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Engagement Analysis", lm, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(summaryData.engagementAnalysis, pw);
      if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
      doc.text(lines, lm + 3, y);
      y += lines.length * 5 + 8;
    }
    addSection("Teaching Suggestions", summaryData.teachingSuggestions, "→");
    addSection("Consider Reviewing", summaryData.conceptsToReview, "⚠");

    doc.save(`${reportTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim()}.pdf`);
    toast.success("Session insight exported as PDF");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setSaved(false);
    onOpenChange(isOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Award className="h-5 w-5 text-primary" />
              {reportTitle}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(recordingDuration)}</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{questionsAsked} questions</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{studentCount} participants</span>
            <span>{format(new Date(), "MMM d, yyyy")}</span>
          </div>
          {summaryData && !isLoading && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant={saved ? "outline" : "default"}
                onClick={handleSave}
                disabled={saving || saved}
                className="rounded-xl gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4 text-success" /> : <Save className="h-4 w-4" />}
                {saved ? "Saved" : "Save Insight"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport} className="rounded-xl gap-2">
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-12rem)] px-6 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Analyzing your lecture...</p>
              <p className="text-sm text-muted-foreground text-center">
                Reviewing transcript and student responses to generate insights.
              </p>
            </div>
          ) : summaryData ? (
            <div className="space-y-6">
              {/* Section 1: Class Performance */}
              {summaryData.checkInResults && summaryData.checkInResults.total > 0 && (() => {
                const acc = Number(summaryData.checkInResults.accuracy);
                const { label, icon: StatusIcon } = getAccuracyLabel(acc);
                return (
                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Class Performance
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusIcon className={`h-4 w-4 ${acc >= 70 ? "text-success" : acc >= 50 ? "text-warning" : "text-destructive"}`} />
                          <span className="text-sm text-muted-foreground">{label}</span>
                        </div>
                        <span className={`text-xl font-bold ${acc >= 70 ? "text-success" : acc >= 50 ? "text-warning" : "text-destructive"}`}>
                          {acc}%
                        </span>
                      </div>
                      <Progress value={acc} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        {summaryData.checkInResults.correct} of {summaryData.checkInResults.total} responses correct
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Section 2: Content Summary */}
              {(summaryData.topicsIdentified?.length > 0 || summaryData.keyConceptsCovered?.length > 0 || summaryData.lectureHighlights?.length > 0) && (
                <Card>
                  <CardContent className="p-5 space-y-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      Content Summary
                    </h3>

                    {summaryData.topicsIdentified?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Topics Covered</p>
                        <div className="flex flex-wrap gap-1.5">
                          {summaryData.topicsIdentified.map((topic, i) => (
                            <Badge key={i} variant="secondary">{topic}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {summaryData.keyConceptsCovered?.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Key Concepts</p>
                          <ul className="space-y-1.5">
                            {summaryData.keyConceptsCovered.map((concept, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                                {concept}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}

                    {summaryData.lectureHighlights?.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Lecture Highlights</p>
                          <ul className="space-y-1.5">
                            {summaryData.lectureHighlights.map((highlight, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <Star className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Section 3: Instructional Reflection */}
              {(summaryData.engagementAnalysis || summaryData.teachingSuggestions?.length > 0) && (
                <Card>
                  <CardContent className="p-5 space-y-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      Instructional Reflection
                    </h3>

                    {summaryData.engagementAnalysis && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Engagement Analysis</p>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          {summaryData.engagementAnalysis}
                        </p>
                      </div>
                    )}

                    {summaryData.teachingSuggestions?.length > 0 && (
                      <>
                        {summaryData.engagementAnalysis && <Separator />}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Teaching Suggestions</p>
                          <ul className="space-y-1.5">
                            {summaryData.teachingSuggestions.map((suggestion, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Section 4: Follow-Up Actions */}
              {summaryData.conceptsToReview?.length > 0 && (
                <Card className="border-dashed border-primary/50 bg-primary/5">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      Follow-Up Actions
                    </h3>
                    <p className="text-xs text-muted-foreground">These concepts may need additional coverage in your next session.</p>
                    <ul className="space-y-2">
                      {summaryData.conceptsToReview.map((concept, i) => (
                        <li key={i} className="text-sm flex items-start gap-2 bg-background p-2.5 rounded-lg border border-border/50">
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                          {concept}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <p className="text-xs text-center text-muted-foreground pb-4 pt-2">
                Report based on {formatDuration(recordingDuration)} of lecture content
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
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
