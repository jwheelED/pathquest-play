import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Users, RefreshCw, ArrowUpDown, Filter, UserCheck,
  ClipboardCheck, Video, Brain, MessageSquareText, Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AcademicIntegrityInsights } from "./AcademicIntegrityInsights";
import { StudentAttentionSignals } from "./StudentAttentionSignals";
import { cn } from "@/lib/utils";
import { compareByAttention, type RosterStudent, type StudentStatus } from "@/lib/studentSignals";
import type { StudentDetailData } from "@/hooks/useStudentDetail";

type SortOption = "attention" | "last-active" | "checkin-high" | "checkin-low" | "name-asc" | "name-desc";
type FilterOption = "all" | "needs-attention" | "quiet" | "new";

interface StudentRosterPanelProps {
  students: RosterStudent[];
  selectedStudentId: string | null;
  onStudentClick: (studentId: string) => void;
  onRefresh: () => void;
  instructorId: string;
  detail: StudentDetailData | null;
  detailLoading: boolean;
  onOpenResponses: () => void;
  loading?: boolean;
}

const statusMeta: Record<StudentStatus, { label: string; cls: string }> = {
  "needs-attention": { label: "Needs attention", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  quiet: { label: "Quiet ≥7d", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  "on-track": { label: "On track", cls: "bg-primary/10 text-primary border-primary/30" },
  new: { label: "New — no data", cls: "bg-muted text-muted-foreground border-border" },
};

function StatusChip({ status }: { status: StudentStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium shrink-0", meta.cls)}>
      {meta.label}
    </Badge>
  );
}

const initials = (name: string) =>
  name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

/** Secondary line under a roster name: only segments with real data. */
function summaryLine(s: RosterStudent): string {
  const parts: string[] = [];
  if (s.lastActiveAt) parts.push(`Last active ${formatDistanceToNow(new Date(s.lastActiveAt), { addSuffix: true })}`);
  if (s.checkIns) parts.push(`Check-ins ${s.checkIns.avg}% (${s.checkIns.n})`);
  if (s.videos.published > 0 && s.videos.started > 0) parts.push(`Videos ${s.videos.completed}/${s.videos.published}`);
  return parts.join(" · ");
}

export const StudentRosterPanel = ({
  students,
  selectedStudentId,
  onStudentClick,
  onRefresh,
  instructorId,
  detail,
  detailLoading,
  onOpenResponses,
  loading,
}: StudentRosterPanelProps) => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("attention");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [showSeeds, setShowSeeds] = useState(false);

  const seedCount = useMemo(() => students.filter(s => s.isSeed).length, [students]);

  const visibleStudents = useMemo(() => {
    let list = students.filter(s => showSeeds || !s.isSeed);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }

    if (filter !== "all") list = list.filter(s => s.status === filter);

    const byLastActive = (a: RosterStudent, b: RosterStudent) => {
      const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      return tb - ta;
    };

    switch (sort) {
      case "attention":
        list.sort(compareByAttention);
        break;
      case "last-active":
        list.sort(byLastActive);
        break;
      case "checkin-high":
        list.sort((a, b) => (b.checkIns?.avg ?? -1) - (a.checkIns?.avg ?? -1));
        break;
      case "checkin-low":
        list.sort((a, b) => (a.checkIns?.avg ?? 999) - (b.checkIns?.avg ?? 999));
        break;
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    return list;
  }, [students, search, sort, filter, showSeeds]);

  const selected = useMemo(
    () => students.find(s => s.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  const visibleEnrolledCount = students.filter(s => !s.isSeed).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Students
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Participation, comprehension, and who needs your attention in this course.
          </p>
        </div>
        <Badge variant="secondary" className="self-start sm:self-auto text-sm px-3 py-1">
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          {visibleEnrolledCount} enrolled
          {seedCount > 0 && !showSeeds && (
            <span className="ml-1 text-muted-foreground">(+{seedCount} test)</span>
          )}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[190px] rounded-xl">
            <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="attention">Needs attention first</SelectItem>
            <SelectItem value="last-active">Recently active</SelectItem>
            <SelectItem value="checkin-low">Check-in avg ↑</SelectItem>
            <SelectItem value="checkin-high">Check-in avg ↓</SelectItem>
            <SelectItem value="name-asc">Name A → Z</SelectItem>
            <SelectItem value="name-desc">Name Z → A</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
          <SelectTrigger className="w-full sm:w-[170px] rounded-xl">
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All students</SelectItem>
            <SelectItem value="needs-attention">Needs attention</SelectItem>
            <SelectItem value="quiet">Quiet</SelectItem>
            <SelectItem value="new">New — no data</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={onRefresh} className="rounded-xl shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[500px]">
        {/* Student List */}
        <Card className="lg:col-span-2 headspace-card overflow-hidden">
          <ScrollArea className="h-[500px]">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
                Loading students…
              </div>
            ) : visibleStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8 gap-2">
                <Users className="h-8 w-8 opacity-40" />
                {search
                  ? "No students match your search."
                  : filter !== "all"
                    ? "No students match this filter."
                    : "No students enrolled yet."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visibleStudents.map((student) => {
                  const isSelected = selectedStudentId === student.id;
                  const line = summaryLine(student);
                  return (
                    <button
                      key={student.id}
                      onClick={() => onStudentClick(student.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 border-l-3 border-primary"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className={cn(
                          "text-xs font-semibold",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {initials(student.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            "text-sm truncate",
                            isSelected ? "font-semibold text-foreground" : "font-medium text-foreground"
                          )}>
                            {student.name}
                          </p>
                          <StatusChip status={student.status} />
                        </div>
                        {line && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{line}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && seedCount > 0 && (
              <button
                onClick={() => setShowSeeds(v => !v)}
                className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border"
              >
                {showSeeds
                  ? "Hide inactive students"
                  : `Show ${seedCount} hidden inactive student${seedCount === 1 ? "" : "s"}`}
              </button>
            )}
          </ScrollArea>
        </Card>

        {/* Detail Panel */}
        <Card className="lg:col-span-3 headspace-card overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 gap-3 min-h-[300px]">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a student to view details</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="p-5 space-y-5">
                {/* Detail Header */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                      {initials(selected.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground truncate">{selected.name}</h3>
                      <StatusChip status={selected.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selected.lastActiveAt
                        ? `Last active ${formatDistanceToNow(new Date(selected.lastActiveAt), { addSuffix: true })}`
                        : "No activity recorded yet"}
                    </p>
                  </div>
                </div>

                {/* Why flagged + suggested action */}
                <StudentAttentionSignals
                  signals={selected.signals}
                  suggestedAction={selected.suggestedAction}
                  status={selected.status}
                />

                {/* Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[11px] font-medium text-muted-foreground">Check-in average</p>
                    </div>
                    {selected.checkIns ? (
                      <>
                        <p className="text-xl font-bold text-foreground">{selected.checkIns.avg}%</p>
                        <p className="text-[11px] text-muted-foreground">across {selected.checkIns.n} check-in{selected.checkIns.n === 1 ? "" : "s"}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No check-ins yet — appears after their first lecture or live session.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Video className="h-3.5 w-3.5 text-secondary" />
                      <p className="text-[11px] font-medium text-muted-foreground">Lecture videos</p>
                    </div>
                    {selected.videos.published === 0 ? (
                      <p className="text-xs text-muted-foreground">No published videos in this course yet.</p>
                    ) : selected.videos.started === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Hasn't started any of the {selected.videos.published} assigned video{selected.videos.published === 1 ? "" : "s"}.
                      </p>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-foreground">
                          {selected.videos.completed}/{selected.videos.published}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          completed · {selected.videos.started} started
                        </p>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[11px] font-medium text-muted-foreground">Comprehension</p>
                    </div>
                    {selected.comprehension ? (
                      <>
                        <p className="text-xl font-bold text-foreground">{selected.comprehension.correctRate}%</p>
                        <p className="text-[11px] text-muted-foreground">
                          correct ({selected.comprehension.n} response{selected.comprehension.n === 1 ? "" : "s"})
                        </p>
                        {selected.confidentWrongCount > 0 && (
                          <Badge variant="outline" className="mt-1.5 text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/30">
                            {selected.confidentWrongCount} confident-but-wrong
                          </Badge>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No question responses yet.</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Recent activity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Recent activity</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl h-7 text-xs"
                      disabled={!detail || detail.totalResponses === 0}
                      onClick={onOpenResponses}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View all responses{detail && detail.totalResponses > 0 ? ` (${detail.totalResponses})` : ""}
                    </Button>
                  </div>
                  {detailLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Loading activity…</p>
                  ) : !detail || detail.recentActivity.length === 0 ? (
                    <div className="flex flex-col items-center text-center py-6 gap-1.5">
                      <MessageSquareText className="h-6 w-6 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        No activity yet — appears once they open a check-in or start a lecture video.
                      </p>
                    </div>
                  ) : (
                    detail.recentActivity.map((a, i) => (
                      <div key={i} className="flex justify-between items-start rounded-lg bg-muted/30 px-3 py-2.5">
                        <p className="text-xs text-foreground min-w-0 truncate">{a.description}</p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(a.date), { addSuffix: true })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </Card>
      </div>

      {/* Academic Integrity */}
      {instructorId && (
        <>
          <Separator />
          <AcademicIntegrityInsights instructorId={instructorId} />
        </>
      )}
    </div>
  );
};
