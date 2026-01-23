import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCourseContext } from "@/hooks/useCourseContext";

interface InstructorOverviewProps {
  instructorId: string;
  className?: string;
}

interface ClassMetrics {
  totalStudents: number;
  activeToday: number;
  avgCompletion: number;
  avgEngagement: number;
}

export function InstructorOverview({ instructorId, className }: InstructorOverviewProps) {
  const [metrics, setMetrics] = useState<ClassMetrics>({
    totalStudents: 0,
    activeToday: 0,
    avgCompletion: 0,
    avgEngagement: 0,
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
          .eq("course_id", selectedCourseId),
        supabase
          .from("student_assignments")
          .select("student_id, grade")
          .eq("instructor_id", instructorId)
          .eq("course_id", selectedCourseId),
      ]);

      const totalStudents = studentsData.data?.length || 0;
      const assignments = assignmentsData.data || [];
      
      // Calculate average completion (assignments with grade)
      const completedAssignments = assignments.filter(a => a.grade !== null);
      const avgCompletion = totalStudents > 0 
        ? Math.round((completedAssignments.length / Math.max(assignments.length, 1)) * 100)
        : 0;

      // Calculate average grade as engagement proxy
      const grades = completedAssignments.map(a => Number(a.grade)).filter(g => !isNaN(g));
      const avgEngagement = grades.length > 0
        ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length)
        : 0;

      // Mock active today (would need real-time tracking)
      const activeToday = Math.min(Math.floor(totalStudents * 0.6), totalStudents);

      setMetrics({
        totalStudents,
        activeToday,
        avgCompletion,
        avgEngagement,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = () => {
    if (metrics.avgEngagement >= 80) return "text-success";
    if (metrics.avgEngagement >= 60) return "text-warning";
    return "text-destructive";
  };

  const getHealthLabel = () => {
    if (metrics.avgEngagement >= 80) return "Excellent";
    if (metrics.avgEngagement >= 60) return "Good";
    if (metrics.avgEngagement >= 40) return "Needs Attention";
    return "Critical";
  };

  if (loading) {
    return (
      <div className={cn("headspace-card rounded-2xl p-6 border border-border/50 animate-pulse", className)}>
        <div className="h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className={cn("headspace-card rounded-2xl p-6 border border-border/50", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Class Health</h3>
          <p className="text-sm text-muted-foreground">Overview of your class performance</p>
        </div>
        <div className={cn("text-right", getHealthColor())}>
          <p className="text-2xl font-bold">{metrics.avgEngagement}%</p>
          <p className="text-xs">{getHealthLabel()}</p>
        </div>
      </div>

      {/* Circular Progress */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              className="text-muted/30"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              className={getHealthColor()}
              strokeDasharray={`${(metrics.avgEngagement / 100) * 352} 352`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <TrendingUp className={cn("w-6 h-6 mb-1", getHealthColor())} />
            <span className="text-xs text-muted-foreground">Engagement</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{metrics.totalStudents}</p>
            <p className="text-xs text-muted-foreground">Students</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-success/5">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{metrics.activeToday}</p>
            <p className="text-xs text-muted-foreground">Active Today</p>
          </div>
        </div>

        <div className="col-span-2 flex items-center gap-3 p-3 rounded-xl bg-secondary/5">
          <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-secondary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Assignment Completion</p>
              <p className="text-sm font-bold text-foreground">{metrics.avgCompletion}%</p>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full bg-secondary transition-all duration-500"
                style={{ width: `${metrics.avgCompletion}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
