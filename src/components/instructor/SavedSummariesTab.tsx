import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  FileDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
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

const getAccuracyLabel = (accuracy: number) => {
  if (accuracy >= 70) return { label: "Strong understanding", icon: TrendingUp, color: "text-success" };
  if (accuracy >= 50) return { label: "Mixed results", icon: AlertTriangle, color: "text-warning" };
  return { label: "Students struggled", icon: TrendingDown, color: "text-destructive" };
};

export function SavedSummariesTab() {
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSummary, setSelectedSummary] = useState<SavedSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [filterMode, setFilterMode] = useState<"all" | "followup">("all");
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

  const filteredSummaries = useMemo(() => {
    let result = [...summaries];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const title = (s.title || "").toLowerCase();
        const topics = (s.summary_data?.topicsIdentified || []).join(" ").toLowerCase();
        return title.includes(q) || topics.includes(q);
      });
    }

    if (filterMode === "followup") {
      result = result.filter((s) => (s.summary_data?.conceptsToReview?.length || 0) > 0);
    }

    if (sortOrder === "oldest") result.reverse();

    return result;
  }, [summaries, searchQuery, sortOrder, filterMode]);

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

  const handleExport = (summary: SavedSummary) => {
    const sd = summary.summary_data;
    const title = summary.title || "Lecture Summary";
    const doc = new jsPDF();
    let y = 20;
    const lm = 15;
    const pw = 180;

    doc.setFontSize(18);
    doc.text(title, lm, y); y += 10;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`${formatDuration(summary.duration_seconds)} · ${summary.questions_asked} questions · ${summary.student_count} students · ${format(new Date(summary.created_at), "MMM d, yyyy")}`, lm, y);
    y += 12;
    doc.setTextColor(0);

    const addSection = (heading: string, items: string[], bullet = "•") => {
      if (!items.length) return;
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(heading, lm, y); y += 7;
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      items.forEach((item) => {
        const lines = doc.splitTextToSize(`${bullet} ${item}`, pw);
        if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, lm + 3, y); y += lines.length * 5 + 2;
      });
      y += 4;
    };

    if (sd.checkInResults && sd.checkInResults.total > 0) {
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("Class Performance", lm, y); y += 7;
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(`Accuracy: ${sd.checkInResults.accuracy}% (${sd.checkInResults.correct}/${sd.checkInResults.total})`, lm + 3, y); y += 10;
    }
    addSection("Topics Covered", sd.topicsIdentified || []);
    addSection("Key Concepts", sd.keyConceptsCovered || [], "✓");
    addSection("Lecture Highlights", sd.lectureHighlights || []);
    if (sd.engagementAnalysis) {
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("Engagement Analysis", lm, y); y += 7;
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(sd.engagementAnalysis, pw);
      if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
      doc.text(lines, lm + 3, y); y += lines.length * 5 + 8;
    }
    addSection("Teaching Suggestions", sd.teachingSuggestions || [], "→");
    addSection("Consider Reviewing", sd.conceptsToReview || [], "⚠");

    doc.save(`${title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}.pdf`);
    toast.success("Summary exported as PDF");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-5 border border-border/50 space-y-3">
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
        title="No saved session insights"
        description="Session insights are generated after 10+ minute live sessions. Save them from the post-session insight sheet."
      />
    );
  }

  const summaryData = selectedSummary?.summary_data;

  return (
    <>
      {/* Library Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Session Insights</h3>
            <Badge variant="secondary" className="text-xs">{summaries.length}</Badge>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as "all" | "followup")}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="followup">Has Follow-ups</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        {filteredSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No session insights match your search.</p>
        ) : (
          <div className="space-y-3">
            {filteredSummaries.map((summary) => {
              const hasFollowUp = (summary.summary_data?.conceptsToReview?.length || 0) > 0;
              const snippet = summary.summary_data?.engagementAnalysis
                ? summary.summary_data.engagementAnalysis.slice(0, 100) + (summary.summary_data.engagementAnalysis.length > 100 ? "…" : "")
                : null;
              const topics = summary.summary_data?.topicsIdentified || [];

              return (
                <Card
                  key={summary.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedSummary(summary)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm truncate">
                            {summary.title || "Untitled Session Insight"}
                          </h4>
                          {hasFollowUp && (
                            <Badge variant="outline" className="text-xs border-warning/50 text-warning shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Needs Follow-up
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(summary.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDuration(summary.duration_seconds)}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            {summary.questions_asked}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {summary.student_count}
                          </span>
                        </div>
                        {topics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {topics.slice(0, 3).map((topic, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                            ))}
                            {topics.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{topics.length - 3}</Badge>
                            )}
                          </div>
                        )}
                        {snippet && (
                          <p className="text-xs text-muted-foreground/80 italic line-clamp-1">{snippet}</p>
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
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSummary} onOpenChange={(open) => !open && setSelectedSummary(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Award className="h-5 w-5 text-primary" />
                {selectedSummary?.title || "Lecture Summary"}
              </DialogTitle>
              {selectedSummary && (
                <Button size="sm" variant="outline" onClick={() => handleExport(selectedSummary)} className="rounded-xl gap-2 shrink-0">
                  <FileDown className="h-4 w-4" />
                  Export PDF
                </Button>
              )}
            </div>
            {selectedSummary && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span>{format(new Date(selectedSummary.created_at), "MMM d, yyyy")}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(selectedSummary.duration_seconds)}</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{selectedSummary.questions_asked}</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{selectedSummary.student_count}</span>
              </div>
            )}
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-8rem)] px-6 py-4">
            {summaryData && selectedSummary && (
              <div className="space-y-6 pb-4">
                {/* Class Performance */}
                {summaryData.checkInResults && summaryData.checkInResults.total > 0 && (() => {
                  const acc = Number(summaryData.checkInResults.accuracy);
                  const { label, icon: StatusIcon, color } = getAccuracyLabel(acc);
                  return (
                    <Card>
                      <CardContent className="p-5 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Class Performance
                        </h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-4 w-4 ${color}`} />
                            <span className="text-sm text-muted-foreground">{label}</span>
                          </div>
                          <span className={`text-xl font-bold ${color}`}>{acc}%</span>
                        </div>
                        <Progress value={acc} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {summaryData.checkInResults.correct} of {summaryData.checkInResults.total} correct
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Content Summary */}
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
                            {summaryData.topicsIdentified.map((t, i) => (
                              <Badge key={i} variant="secondary">{t}</Badge>
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
                              {summaryData.keyConceptsCovered.map((c, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />{c}
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
                            <p className="text-xs font-medium text-muted-foreground mb-2">Highlights</p>
                            <ul className="space-y-1.5">
                              {summaryData.lectureHighlights.map((h, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <Star className="h-4 w-4 text-warning mt-0.5 shrink-0" />{h}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Instructional Reflection */}
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
                          <p className="text-sm text-foreground/80 leading-relaxed">{summaryData.engagementAnalysis}</p>
                        </div>
                      )}
                      {summaryData.teachingSuggestions?.length > 0 && (
                        <>
                          {summaryData.engagementAnalysis && <Separator />}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Teaching Suggestions</p>
                            <ul className="space-y-1.5">
                              {summaryData.teachingSuggestions.map((s, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />{s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Follow-Up */}
                {summaryData.conceptsToReview?.length > 0 && (
                  <Card className="border-dashed border-primary/50 bg-primary/5">
                    <CardContent className="p-5 space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        Follow-Up Actions
                      </h3>
                      <p className="text-xs text-muted-foreground">These concepts may need additional coverage.</p>
                      <ul className="space-y-2">
                        {summaryData.conceptsToReview.map((c, i) => (
                          <li key={i} className="text-sm flex items-start gap-2 bg-background p-2.5 rounded-lg border border-border/50">
                            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />{c}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <p className="text-xs text-center text-muted-foreground pt-2">
                  Report from {formatDuration(selectedSummary.duration_seconds)} of lecture content
                </p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
