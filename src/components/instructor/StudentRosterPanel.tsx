import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Users, RefreshCw, Target, Flame, BookOpen,
  CheckCircle2, XCircle, ArrowUpDown, Filter, UserCheck
} from "lucide-react";
import { AcademicIntegrityInsights } from "./AcademicIntegrityInsights";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
  averageMasteryAttempts?: number;
  average_grade?: number;
}

interface StudentDetail {
  id: string;
  name: string;
  level?: number;
  experience_points?: number;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
  problemAttempts: Array<{
    problem_text: string;
    is_correct: boolean;
    time_spent_seconds: number;
    created_at: string;
  }>;
  recentActivity: Array<{
    type: string;
    description: string;
    date: string;
  }>;
}

type SortOption = "name-asc" | "name-desc" | "grade-high" | "grade-low";
type FilterOption = "all" | "has-grades" | "no-grades";

interface StudentRosterPanelProps {
  students: Student[];
  onStudentClick: (studentId: string) => void;
  onRefresh: () => void;
  instructorId: string;
  selectedStudentDetail: StudentDetail | null;
  selectedStudentId: string | null;
  loading?: boolean;
}

export const StudentRosterPanel = ({
  students,
  onStudentClick,
  onRefresh,
  instructorId,
  selectedStudentDetail,
  selectedStudentId,
  loading,
}: StudentRosterPanelProps) => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [filter, setFilter] = useState<FilterOption>("all");

  const filteredStudents = useMemo(() => {
    let list = [...students];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    // Filter
    if (filter === "has-grades") list = list.filter((s) => s.average_grade != null);
    if (filter === "no-grades") list = list.filter((s) => s.average_grade == null);

    // Sort
    switch (sort) {
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "grade-high":
        list.sort((a, b) => (b.average_grade ?? -1) - (a.average_grade ?? -1));
        break;
      case "grade-low":
        list.sort((a, b) => (a.average_grade ?? 999) - (b.average_grade ?? 999));
        break;
    }

    return list;
  }, [students, search, sort, filter]);

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const gradeColor = (grade?: number) => {
    if (grade == null) return "";
    if (grade >= 80) return "text-primary";
    if (grade >= 60) return "text-orange-600 dark:text-orange-400";
    return "text-destructive";
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Participants
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View enrollment, participation, and participant activity for this course.
          </p>
        </div>
        <Badge variant="secondary" className="self-start sm:self-auto text-sm px-3 py-1">
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          {students.length} enrolled
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search participants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
            <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A → Z</SelectItem>
            <SelectItem value="name-desc">Name Z → A</SelectItem>
            <SelectItem value="grade-high">Grade ↓</SelectItem>
            <SelectItem value="grade-low">Grade ↑</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
          <SelectTrigger className="w-full sm:w-[160px] rounded-xl">
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Students</SelectItem>
            <SelectItem value="has-grades">Has Grades</SelectItem>
            <SelectItem value="no-grades">No Grades</SelectItem>
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
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8 gap-2">
                <Users className="h-8 w-8 opacity-40" />
                {search ? "No students match your search." : "No students enrolled yet."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredStudents.map((student) => {
                  const isSelected = selectedStudentId === student.id;
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
                        <p className={cn(
                          "text-sm truncate",
                          isSelected ? "font-semibold text-foreground" : "font-medium text-foreground"
                        )}>
                          {student.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {student.average_grade != null && (
                            <span className={cn("text-xs font-semibold", gradeColor(student.average_grade))}>
                              {Math.round(student.average_grade)}%
                            </span>
                          )}
                          {student.current_streak > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Flame className="h-3 w-3 text-orange-500" />
                              {student.current_streak}d
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Detail Panel */}
        <Card className="lg:col-span-3 headspace-card overflow-hidden">
          {!selectedStudentDetail ? (
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
                      {initials(selectedStudentDetail.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedStudentDetail.name}</h3>
                    <p className="text-xs text-muted-foreground">Student details &amp; activity</p>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3 text-center">
                    <Target className="h-4 w-4 mx-auto text-primary mb-1" />
                    <p className="text-xl font-bold text-foreground">{selectedStudentDetail.level ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">Level</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3 text-center">
                    <Flame className="h-4 w-4 mx-auto text-orange-500 mb-1" />
                    <p className="text-xl font-bold text-foreground">{selectedStudentDetail.current_streak}d</p>
                    <p className="text-[11px] text-muted-foreground">Streak</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3 text-center">
                    <BookOpen className="h-4 w-4 mx-auto text-secondary mb-1" />
                    <p className="text-xl font-bold text-foreground">
                      {selectedStudentDetail.completedLessons}/{selectedStudentDetail.totalLessons}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Lessons</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Lesson progress</span>
                    <span className="font-semibold text-foreground">
                      {selectedStudentDetail.totalLessons > 0
                        ? Math.round((selectedStudentDetail.completedLessons / selectedStudentDetail.totalLessons) * 100)
                        : 0}%
                    </span>
                  </div>
                  <Progress
                    value={
                      selectedStudentDetail.totalLessons > 0
                        ? (selectedStudentDetail.completedLessons / selectedStudentDetail.totalLessons) * 100
                        : 0
                    }
                    className="h-2"
                  />
                </div>

                <Separator />

                {/* Tabbed Content */}
                <Tabs defaultValue="activity" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="attempts">Attempts</TabsTrigger>
                  </TabsList>

                  <TabsContent value="activity" className="space-y-2 mt-3">
                    {selectedStudentDetail.recentActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No recent activity.</p>
                    ) : (
                      selectedStudentDetail.recentActivity.map((a, i) => (
                        <div key={i} className="flex justify-between items-start rounded-lg bg-muted/30 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground">{a.type}</p>
                            <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                            {new Date(a.date).toLocaleDateString()}
                          </span>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="attempts" className="space-y-2 mt-3">
                    {selectedStudentDetail.problemAttempts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No problem attempts yet.</p>
                    ) : (
                      selectedStudentDetail.problemAttempts.map((att, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3 py-2.5">
                          {att.is_correct ? (
                            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{att.problem_text}</p>
                            <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                              <span>{Math.floor(att.time_spent_seconds / 60)}m {att.time_spent_seconds % 60}s</span>
                              <span>{new Date(att.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                </Tabs>
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
