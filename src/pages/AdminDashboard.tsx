import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Building2, Shield } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import ROIMetricsCard from "@/components/admin/ROIMetricsCard";
import EngagementChart from "@/components/admin/EngagementChart";
import SchoolProgressCard from "@/components/admin/SchoolProgressCard";
import ExportReportsCard from "@/components/admin/ExportReportsCard";
import OrganizationSetup from "@/components/admin/OrganizationSetup";
import RetentionHealthCard from "@/components/admin/RetentionHealthCard";
import AtRiskStudentsTable, { AtRiskStudent, calculateRiskScore } from "@/components/admin/AtRiskStudentsTable";
import InstructorPerformanceCard, { InstructorPerformance } from "@/components/admin/InstructorPerformanceCard";
import { formatDistanceToNow } from "date-fns";

export default function AdminDashboard() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    totalLessonsCompleted: 0,
    totalAchievementsUnlocked: 0,
    avgCompletionRate: 0,
    avgTimeSpent: 0,
    engagementScore: 0,
  });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [instructorPerformance, setInstructorPerformance] = useState<InstructorPerformance[]>([]);
  const [retentionMetrics, setRetentionMetrics] = useState({
    atRiskCount: 0,
    passRate: 0,
    retentionRate: 0,
    avgCompletionRate: 0,
  });
  const [adminName, setAdminName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session) {
      fetchDashboardData();
    }
  }, [session]);

  const checkSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/");
    } else {
      setSession(data.session);
      
      // Check if user is admin using user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      if (!roleData) {
        toast.error("Access denied. Admin privileges required.");
        navigate("/");
      }
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get admin's profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, full_name")
        .eq("id", user.id)
        .single();

      setAdminName(profile?.full_name || "Administrator");
      const userOrgId = profile?.org_id;
      
      if (!userOrgId) {
        toast.error("No organization assigned");
        setLoading(false);
        return;
      }

      // Get connected instructors for this admin
      const { data: connectedInstructors } = await supabase
        .from('admin_instructors')
        .select('instructor_id')
        .eq('admin_id', user.id);

      const instructorIds = connectedInstructors?.map(ci => ci.instructor_id) || [];

      // If no instructors connected, show empty state
      if (instructorIds.length === 0) {
        setStats({
          totalStudents: 0,
          activeStudents: 0,
          totalLessonsCompleted: 0,
          totalAchievementsUnlocked: 0,
          avgCompletionRate: 0,
          avgTimeSpent: 0,
          engagementScore: 0,
        });
        setWeeklyData([]);
        setAtRiskStudents([]);
        setInstructorPerformance([]);
        setRetentionMetrics({
          atRiskCount: 0,
          passRate: 0,
          retentionRate: 0,
          avgCompletionRate: 0,
        });
        setLoading(false);
        return;
      }

      // Get instructor profiles
      const { data: instructorProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', instructorIds);

      const instructorMap = new Map(
        instructorProfiles?.map(i => [i.id, i.full_name || 'Unknown Instructor']) || []
      );

      // Get student IDs from connected instructors
      const { data: studentRelations } = await supabase
        .from('instructor_students')
        .select('student_id, instructor_id')
        .in('instructor_id', instructorIds)
        .eq('org_id', userOrgId);

      const studentIds = [...new Set(studentRelations?.map(sr => sr.student_id) || [])];

      // Count students with student role in this org
      const { count: totalStudents } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "student")
        .in("user_id", studentIds);

      // Fetch active students (activity in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: activeUserStats, count: activeStudents } = await supabase
        .from("user_stats")
        .select("user_id, last_activity_date", { count: 'exact' })
        .eq("org_id", userOrgId)
        .gte("last_activity_date", sevenDaysAgo.toISOString().split('T')[0]);

      const activeUserIds = new Set(activeUserStats?.map(s => s.user_id) || []);

      // Fetch lesson progress for org
      const { data: lessonData } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("org_id", userOrgId);

      // Fetch achievements for org
      const { data: achievementData } = await supabase
        .from("user_achievements")
        .select("*")
        .eq("org_id", userOrgId);

      // Fetch user stats for calculations
      const { data: userStats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("org_id", userOrgId);

      // Fetch student profiles for at-risk table
      const { data: studentProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", studentIds);

      const studentNameMap = new Map(
        studentProfiles?.map(s => [s.id, s.full_name || 'Unknown Student']) || []
      );

      // Fetch student assignments for grade and completion analysis
      const { data: assignments } = await supabase
        .from("student_assignments")
        .select("student_id, instructor_id, grade, completed, created_at")
        .in("student_id", studentIds);

      // Calculate per-student metrics
      const studentMetrics = new Map<string, {
        grades: number[];
        completed: number;
        total: number;
        instructorId: string;
        lastActivity: Date | null;
      }>();

      assignments?.forEach(a => {
        if (!studentMetrics.has(a.student_id)) {
          studentMetrics.set(a.student_id, {
            grades: [],
            completed: 0,
            total: 0,
            instructorId: a.instructor_id,
            lastActivity: null,
          });
        }
        const metrics = studentMetrics.get(a.student_id)!;
        metrics.total++;
        if (a.completed) {
          metrics.completed++;
          if (a.grade !== null) {
            metrics.grades.push(a.grade);
          }
        }
        const assignmentDate = new Date(a.created_at);
        if (!metrics.lastActivity || assignmentDate > metrics.lastActivity) {
          metrics.lastActivity = assignmentDate;
        }
      });

      // Calculate at-risk students
      const atRiskList: AtRiskStudent[] = [];
      let passCount = 0;
      let totalGradedStudents = 0;
      let totalCompletionRate = 0;

      studentMetrics.forEach((metrics, studentId) => {
        const avgGrade = metrics.grades.length > 0
          ? metrics.grades.reduce((a, b) => a + b, 0) / metrics.grades.length
          : 0;

        const completionRate = metrics.total > 0
          ? (metrics.completed / metrics.total) * 100
          : 0;

        totalCompletionRate += completionRate;

        if (metrics.grades.length > 0) {
          totalGradedStudents++;
          if (avgGrade >= 60) {
            passCount++;
          }
        }

        // Calculate days since last activity
        const lastActivityStat = userStats?.find(s => s.user_id === studentId);
        const lastActivityDate = lastActivityStat?.last_activity_date
          ? new Date(lastActivityStat.last_activity_date)
          : metrics.lastActivity;
        
        const daysSinceActive = lastActivityDate
          ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
          : 30;

        const incompleteAssignments = metrics.total - metrics.completed;
        const streakBroken = lastActivityStat?.current_streak === 0 && (lastActivityStat?.longest_streak || 0) > 3;

        const { score, level, factors } = calculateRiskScore(
          avgGrade,
          daysSinceActive,
          incompleteAssignments,
          streakBroken,
          0
        );

        // Only include students with some risk
        if (score >= 3) {
          atRiskList.push({
            id: studentId,
            name: studentNameMap.get(studentId) || 'Unknown Student',
            email: '', // Privacy: not showing email
            instructorName: instructorMap.get(metrics.instructorId) || 'Unknown',
            avgGrade,
            lastActive: lastActivityDate
              ? formatDistanceToNow(lastActivityDate, { addSuffix: true })
              : 'Never',
            incompleteAssignments,
            riskScore: score,
            riskLevel: level,
            riskFactors: factors,
          });
        }
      });

      // Sort by risk score descending
      atRiskList.sort((a, b) => b.riskScore - a.riskScore);
      setAtRiskStudents(atRiskList);

      // Calculate instructor performance
      const instructorStats = new Map<string, {
        studentCount: number;
        grades: number[];
        atRiskCount: number;
        activeCount: number;
      }>();

      instructorIds.forEach(id => {
        instructorStats.set(id, {
          studentCount: 0,
          grades: [],
          atRiskCount: 0,
          activeCount: 0,
        });
      });

      studentRelations?.forEach(rel => {
        const stats = instructorStats.get(rel.instructor_id);
        if (stats) {
          stats.studentCount++;
          if (activeUserIds.has(rel.student_id)) {
            stats.activeCount++;
          }
        }
      });

      studentMetrics.forEach((metrics, studentId) => {
        const stats = instructorStats.get(metrics.instructorId);
        if (stats && metrics.grades.length > 0) {
          const avgGrade = metrics.grades.reduce((a, b) => a + b, 0) / metrics.grades.length;
          stats.grades.push(avgGrade);
        }
      });

      atRiskList.forEach(student => {
        const instructorId = studentRelations?.find(r => r.student_id === student.id)?.instructor_id;
        if (instructorId) {
          const stats = instructorStats.get(instructorId);
          if (stats) {
            stats.atRiskCount++;
          }
        }
      });

      const instructorPerf: InstructorPerformance[] = instructorIds.map(id => {
        const stats = instructorStats.get(id)!;
        const avgGrade = stats.grades.length > 0
          ? stats.grades.reduce((a, b) => a + b, 0) / stats.grades.length
          : 0;

        return {
          id,
          name: instructorMap.get(id) || 'Unknown Instructor',
          email: '',
          studentCount: stats.studentCount,
          avgClassGrade: avgGrade,
          atRiskCount: stats.atRiskCount,
          activeRate: stats.studentCount > 0
            ? (stats.activeCount / stats.studentCount) * 100
            : 0,
        };
      });

      setInstructorPerformance(instructorPerf);

      // Calculate metrics
      const avgTimeSpent = userStats && userStats.length > 0
        ? userStats.reduce((acc, stat) => acc + (stat.current_streak || 0), 0) / userStats.length
        : 0;

      const totalLessonsCompleted = lessonData?.length || 0;
      const totalAchievementsUnlocked = achievementData?.length || 0;
      
      // Calculate completion rate
      const { data: allLessons } = await supabase
        .from("lessons")
        .select("id");
      
      const avgCompletionRate = allLessons && allLessons.length > 0
        ? (totalLessonsCompleted / (allLessons.length * (totalStudents || 1))) * 100
        : 0;

      // Engagement score (percentage of active vs total students)
      const engagementScore = totalStudents && totalStudents > 0
        ? ((activeStudents || 0) / totalStudents) * 100
        : 0;

      setStats({
        totalStudents: totalStudents || 0,
        activeStudents: activeStudents || 0,
        totalLessonsCompleted,
        totalAchievementsUnlocked,
        avgCompletionRate: Math.min(avgCompletionRate, 100),
        avgTimeSpent,
        engagementScore,
      });

      // Set retention metrics
      const passRate = totalGradedStudents > 0 ? (passCount / totalGradedStudents) * 100 : 100;
      const avgAssignmentCompletion = studentMetrics.size > 0
        ? totalCompletionRate / studentMetrics.size
        : 0;

      setRetentionMetrics({
        atRiskCount: atRiskList.length,
        passRate,
        retentionRate: engagementScore,
        avgCompletionRate: avgAssignmentCompletion,
      });

      // Generate weekly engagement data
      const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      setWeeklyData(weeks.map((week, i) => ({
        week,
        students: Math.floor((activeStudents || 0) * (0.8 + Math.random() * 0.4)),
        problems: Math.floor(Math.random() * 150 + 50),
        lessons: Math.floor(Math.random() * 80 + 20),
      })));

    } catch (error) {
      logger.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading Leadership Console...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    Edvana Leadership Console
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Institutional Analytics for Deans, Chairs & Administrators
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 hidden sm:flex">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:block">
                Welcome, {adminName}
              </span>
              <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Organization Setup Section */}
          <OrganizationSetup />

          {/* Top Row: Retention Health (Full Width) */}
          <RetentionHealthCard
            atRiskCount={retentionMetrics.atRiskCount}
            totalStudents={stats.totalStudents}
            passRate={retentionMetrics.passRate}
            retentionRate={retentionMetrics.retentionRate}
            avgCompletionRate={retentionMetrics.avgCompletionRate}
          />

          {/* At-Risk Students Table (Full Width) */}
          <AtRiskStudentsTable students={atRiskStudents} loading={loading} />

          {/* Third Row: Instructor Performance + ROI Metrics */}
          <div className="grid lg:grid-cols-2 gap-6">
            <InstructorPerformanceCard
              instructors={instructorPerformance}
              loading={loading}
            />
            <ROIMetricsCard
              totalStudents={stats.totalStudents}
              avgTimeSpent={stats.avgTimeSpent}
              completionRate={stats.avgCompletionRate}
              engagementScore={stats.engagementScore}
            />
          </div>

          {/* Fourth Row: School Progress + Engagement Chart */}
          <div className="grid lg:grid-cols-2 gap-6">
            <SchoolProgressCard
              totalStudents={stats.totalStudents}
              activeStudents={stats.activeStudents}
              totalLessonsCompleted={stats.totalLessonsCompleted}
              totalAchievementsUnlocked={stats.totalAchievementsUnlocked}
              avgCompletionRate={stats.avgCompletionRate}
            />
            <EngagementChart data={weeklyData} />
          </div>

          {/* Bottom Row: Export Reports */}
          <ExportReportsCard data={stats} />
        </div>
      </div>
    </div>
  );
}
