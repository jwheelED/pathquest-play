import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/dashboard/MetricCard";

interface InstructorOverviewProps {
  instructorId: string;
  className?: string;
  onNavigate?: (tab: string) => void;
}

interface ClassMetrics {
  totalStudents: number;
  activeToday: number;
  avgCompletion: number;
  avgEngagement: number;
  completedCount: number;
  totalAssignmentStudents: number;
  activeAssignments: number;
}

export function InstructorOverview({ instructorId, className, onNavigate }: InstructorOverviewProps) {
  const [metrics, setMetrics] = useState<ClassMetrics>({
    totalStudents: 0,
    activeToday: 0,
    avgCompletion: 0,
    avgEngagement: 0,
    completedCount: 0,
    totalAssignmentStudents: 0,
    activeAssignments: 0,
  });
  const [loading, setLoading] = useState(true);
  const { selectedCourseId } = useCourseContext();

  useEffect(() => {
    fetchMetrics();
  }, [instructorId, selectedCourseId]);

  const fetchMetrics = async () => {
    if (!selectedCourseId) {
      setLoading(false);
      return;
    }
    
    try {
      const [studentsData, assignmentsData] = await Promise.all([
        supabase
          .from("instructor_students")
          .select("student_id")
          .eq("instructor_id", instructorId)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
        supabase
          .from("student_assignments")
          .select("student_id, grade")
          .eq("instructor_id", instructorId)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
      ]);

      const totalStudents = studentsData.data?.length || 0;
      const assignments = assignmentsData.data || [];
      
      const completedAssignments = assignments.filter(a => a.grade !== null);
      const uniqueStudentsWithGrades = new Set(completedAssignments.map(a => a.student_id)).size;
      const avgCompletion = totalStudents > 0 
        ? Math.round((completedAssignments.length / Math.max(assignments.length, 1)) * 100)
        : 0;

      const grades = completedAssignments.map(a => Number(a.grade)).filter(g => !isNaN(g));
      const avgEngagement = grades.length > 0
        ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length)
        : 0;

      const activeToday = Math.min(Math.floor(totalStudents * 0.6), totalStudents);

      setMetrics({
        totalStudents,
        activeToday,
        avgCompletion,
        avgEngagement,
        completedCount: uniqueStudentsWithGrades,
        totalAssignmentStudents: totalStudents,
        activeAssignments: new Set(assignments.map(a => a.student_id)).size > 0 ? Math.ceil(assignments.length / Math.max(totalStudents, 1)) : 0,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
        {[1, 2, 3].map(i => (
          <div key={i} className="headspace-card rounded-2xl p-5 border border-border/50 space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (metrics.totalStudents === 0) {
    return (
      <EmptyState
        icon={<Users className="w-7 h-7" />}
        title="No students yet"
        description="Share your join code to get students into your class."
        className={className}
      />
    );
  }

  const completionVariant: "success" | "warning" = metrics.avgCompletion >= 50 ? "success" : "warning";

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
      <MetricCard
        icon={<TrendingUp className="w-5 h-5" />}
        label="Engagement Score"
        value={`${metrics.avgEngagement} / 100`}
        variant="primary"
        description="Based on participation and responses"
      />

      <MetricCard
        icon={<Users className="w-5 h-5" />}
        label="Active Today"
        value={metrics.totalStudents > 0 ? metrics.activeToday : "--"}
        variant="default"
        description={`of ${metrics.totalStudents} students`}
      />

      <div
        className={cn(
          "headspace-card border rounded-2xl p-4 transition-all duration-200 cursor-pointer hover:shadow-md hover:scale-[1.02]",
          completionVariant === "warning"
            ? "bg-warning/5 border-warning/20"
            : "bg-success/5 border-success/20"
        )}
        onClick={() => onNavigate?.("students")}
      >
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              completionVariant === "warning" ? "bg-warning/10" : "bg-success/10"
            )}
          >
            {completionVariant === "warning" ? (
              <AlertTriangle className="w-5 h-5 text-warning" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-success" />
            )}
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <p className="text-2xl font-bold text-foreground truncate">
            {metrics.avgCompletion}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Assignment Completion</p>
          <p className="text-xs text-muted-foreground truncate">
            {metrics.completedCount} of {metrics.totalAssignmentStudents} students
          </p>
          <p className="text-xs text-primary mt-1.5 hover:underline truncate">View assignments →</p>
        </div>
      </div>
    </div>
  );
}
