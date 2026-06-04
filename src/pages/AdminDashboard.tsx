import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Building2, Shield, LayoutDashboard, Users, BarChart3, HeartHandshake, Settings, GraduationCap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import OrganizationSetup from "@/components/admin/OrganizationSetup";
import GovernanceChips from "@/components/admin/GovernanceChips";
import AggregateMetricsCard from "@/components/admin/AggregateMetricsCard";
import UsageOverTimeChart from "@/components/admin/UsageOverTimeChart";
import LearningInsightsCard from "@/components/admin/LearningInsightsCard";
import AtRiskStudentsTable, { AtRiskStudent, calculateRiskScore } from "@/components/admin/AtRiskStudentsTable";
import InstructorPerformanceCard, { InstructorPerformance } from "@/components/admin/InstructorPerformanceCard";
import CourseEngagementHealthCard, { CourseEngagement, EngagementSignal } from "@/components/admin/CourseEngagementHealthCard";
import RetentionHealthCard from "@/components/admin/RetentionHealthCard";
import ExportReportsCard from "@/components/admin/ExportReportsCard";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { SmartPresetChips } from "@/components/admin/SmartPresetChips";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { useAdminFilters } from "@/hooks/useAdminFilters";
import { SMART_PRESETS } from "@/lib/adminSmartPresets";
import { LMSIntegrationSettings } from "@/components/instructor/LMSIntegrationSettings";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type TabValue = "overview" | "adoption" | "support" | "settings";

export default function AdminDashboard() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    avgCompletionRate: 0,
  });
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [instructorPerformance, setInstructorPerformance] = useState<InstructorPerformance[]>([]);
  const [courseEngagement, setCourseEngagement] = useState<CourseEngagement[]>([]);
  const [retentionMetrics, setRetentionMetrics] = useState({
    atRiskCount: 0,
    passRate: 0,
    retentionRate: 0,
    avgCompletionRate: 0,
  });
  const [adminName, setAdminName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [instructorIds, setInstructorIds] = useState<string[]>([]);
  const navigate = useNavigate();

  const { filters } = useAdminFilters();
  const activePreset = useMemo(
    () => SMART_PRESETS.find((p) => p.id === filters.presetId),
    [filters.presetId],
  );

  // Use the new hook for aggregate data (now filter-aware)
  const { metrics, weeklyUsage, misconceptions, confidenceIssues, hasAnyData, loading: aggregateLoading } =
    useAdminDashboardData(instructorIds, filters);


  // Client-side refinements: filter atRiskStudents and instructorPerformance by global filters + preset refinement
  const filteredAtRisk = useMemo(() => {
    let list = atRiskStudents;
    if (filters.instructorIds.length > 0) {
      const names = new Set(
        instructorPerformance
          .filter((i) => filters.instructorIds.includes(i.id))
          .map((i) => i.name),
      );
      list = list.filter((s) => names.has(s.instructorName));
    }
    const ref = activePreset?.refinement;
    if (ref?.riskLevels) list = list.filter((s) => ref.riskLevels!.includes(s.riskLevel));
    if (ref?.inactiveDays != null) {
      list = list.filter((s) => s.lastActive.includes("day") || s.lastActive === "Never");
    }
    return list;
  }, [atRiskStudents, instructorPerformance, filters.instructorIds, activePreset]);

  const filteredInstructorPerf = useMemo(() => {
    if (filters.instructorIds.length === 0) return instructorPerformance;
    return instructorPerformance.filter((i) => filters.instructorIds.includes(i.id));
  }, [instructorPerformance, filters.instructorIds]);

  const filteredCourseEngagement = useMemo(() => {
    if (filters.instructorIds.length === 0) return courseEngagement;
    const allowedNames = new Set(
      instructorPerformance
        .filter((i) => filters.instructorIds.includes(i.id))
        .map((i) => i.name),
    );
    return courseEngagement.filter((c) => allowedNames.has(c.instructorName));
  }, [courseEngagement, instructorPerformance, filters.instructorIds]);

  const filteredMisconceptions = useMemo(() => {
    const ref = activePreset?.refinement;
    if (!ref?.maxCorrectRate) return misconceptions;
    return misconceptions.filter((m) => m.correctRate <= ref.maxCorrectRate!);
  }, [misconceptions, activePreset]);

  const filteredConfidenceIssues = useMemo(() => {
    const ref = activePreset?.refinement;
    if (!ref?.minConfidentWrong) return confidenceIssues;
    return confidenceIssues.filter((c) => c.confidentWrongCount >= ref.minConfidentWrong!);
  }, [confidenceIssues, activePreset]);

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, full_name")
        .eq("id", user.id)
        .single();

      setAdminName(profile?.full_name || "Administrator");
      const userOrgId = profile?.org_id;
      setOrgId(userOrgId ?? null);

      if (!userOrgId) {
        // No org yet — let OrganizationSetup handle creation
        setLoading(false);
        return;
      }

      // Only show instructors actually connected to this admin — either they
      // accepted an invite to this org or their email domain matches one
      // registered to this org. Excludes bulk/legacy org members.
      const { data: connectedRows } = await supabase
        .rpc("get_admin_connected_instructors", { _admin_id: user.id });

      const fetchedInstructorIds: string[] = [
        ...new Set(((connectedRows as any[]) || []).map((r) => r.instructor_id)),
      ];
      setInstructorIds(fetchedInstructorIds);

      if (fetchedInstructorIds.length === 0) {
        setStats({
          totalStudents: 0,
          activeStudents: 0,
          avgCompletionRate: 0,
        });
        setAtRiskStudents([]);
        setInstructorPerformance([]);
        setCourseEngagement([]);
        setRetentionMetrics({
          atRiskCount: 0,
          passRate: 0,
          retentionRate: 0,
          avgCompletionRate: 0,
        });
        setLoading(false);
        return;
      }

      const { data: instructorProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', fetchedInstructorIds);

      const instructorMap = new Map(
        instructorProfiles?.map(i => [i.id, i.full_name || 'Unknown Instructor']) || []
      );

      const { data: studentRelations } = await supabase
        .from('instructor_students')
        .select('student_id, instructor_id')
        .in('instructor_id', fetchedInstructorIds)
        .eq('org_id', userOrgId);

      const studentIds = [...new Set(studentRelations?.map(sr => sr.student_id) || [])];

      const { count: totalStudents } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "student")
        .in("user_id", studentIds);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: activeUserStats, count: activeStudents } = await supabase
        .from("user_stats")
        .select("user_id, last_activity_date", { count: 'exact' })
        .eq("org_id", userOrgId)
        .gte("last_activity_date", sevenDaysAgo.toISOString().split('T')[0]);

      const activeUserIds = new Set(activeUserStats?.map(s => s.user_id) || []);

      const { data: userStats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("org_id", userOrgId);

      const { data: studentProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", studentIds);

      const studentNameMap = new Map(
        studentProfiles?.map(s => [s.id, s.full_name || 'Unknown Student']) || []
      );

      const { data: assignments } = await supabase
        .from("student_assignments")
        .select("student_id, instructor_id, grade, completed, created_at")
        .in("student_id", studentIds)
        .in("instructor_id", fetchedInstructorIds);

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

        if (score >= 3) {
          atRiskList.push({
            id: studentId,
            name: studentNameMap.get(studentId) || 'Unknown Student',
            email: '',
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

      atRiskList.sort((a, b) => b.riskScore - a.riskScore);
      setAtRiskStudents(atRiskList);

      const instructorStats = new Map<string, {
        studentCount: number;
        grades: number[];
        atRiskCount: number;
        activeCount: number;
      }>();

      fetchedInstructorIds.forEach(id => {
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

      const instructorPerf: InstructorPerformance[] = fetchedInstructorIds.map(id => {
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

      // ===== Course Engagement Health =====
      try {
        const { data: courseRows } = await supabase
          .from("courses")
          .select("id, title, instructor_id")
          .in("instructor_id", fetchedInstructorIds)
          .eq("is_active", true);

        const courses = courseRows || [];
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        const WINDOW_DAYS = 28;
        const since = new Date(now - WINDOW_DAYS * DAY).toISOString();

        const { data: sessionRows } = await (supabase.from("live_sessions") as any)
          .select("id, course_id, instructor_id, created_at")
          .in("instructor_id", fetchedInstructorIds)
          .gte("created_at", since);

        const sessions = (sessionRows || []) as Array<{ id: string; course_id: string | null; instructor_id: string; created_at: string }>;
        const sessionIds = sessions.map(s => s.id);

        let participantsBySession = new Map<string, number>();
        let questionsBySession = new Map<string, number>();
        let responsesBySession = new Map<string, number>();

        if (sessionIds.length > 0) {
          const [{ data: partRows }, { data: qRows }] = await Promise.all([
            (supabase.from("live_participants") as any)
              .select("session_id")
              .in("session_id", sessionIds),
            (supabase.from("live_questions") as any)
              .select("id, session_id")
              .in("session_id", sessionIds),
          ]);

          ((partRows || []) as Array<{ session_id: string }>).forEach(p => {
            participantsBySession.set(p.session_id, (participantsBySession.get(p.session_id) || 0) + 1);
          });

          const questionToSession = new Map<string, string>();
          ((qRows || []) as Array<{ id: string; session_id: string }>).forEach(q => {
            questionToSession.set(q.id, q.session_id);
            questionsBySession.set(q.session_id, (questionsBySession.get(q.session_id) || 0) + 1);
          });

          const questionIds = Array.from(questionToSession.keys());
          if (questionIds.length > 0) {
            // Chunk if huge — usually fine in <=1000
            const { data: respRows } = await (supabase.from("live_responses") as any)
              .select("question_id")
              .in("question_id", questionIds);
            ((respRows || []) as Array<{ question_id: string }>).forEach(r => {
              const sid = questionToSession.get(r.question_id);
              if (sid) responsesBySession.set(sid, (responsesBySession.get(sid) || 0) + 1);
            });
          }
        }

        const sessionRate = (sid: string) => {
          const p = participantsBySession.get(sid) || 0;
          const q = questionsBySession.get(sid) || 0;
          const r = responsesBySession.get(sid) || 0;
          const denom = p * q;
          if (denom <= 0) return null;
          return Math.min(100, Math.round((r / denom) * 100));
        };

        const courseSessions = new Map<string, typeof sessions>();
        sessions.forEach(s => {
          if (!s.course_id) return;
          const arr = courseSessions.get(s.course_id) || [];
          arr.push(s);
          courseSessions.set(s.course_id, arr);
        });

        const engagement: CourseEngagement[] = courses.map(course => {
          const csSessions = courseSessions.get(course.id) || [];
          const inWindow = (days: number) => {
            const cutoff = now - days * DAY;
            return csSessions.filter(s => new Date(s.created_at).getTime() >= cutoff);
          };

          const avgRate = (list: typeof sessions) => {
            const rates = list.map(s => sessionRate(s.id)).filter((v): v is number => v !== null);
            if (!rates.length) return 0;
            return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
          };

          const current = avgRate(inWindow(7));
          const prior = avgRate(csSessions.filter(s => {
            const t = new Date(s.created_at).getTime();
            return t < now - 7 * DAY && t >= now - 14 * DAY;
          }));

          const sparkline = [3, 2, 1, 0].map(weeksAgo => {
            const start = now - (weeksAgo + 1) * 7 * DAY;
            const end = now - weeksAgo * 7 * DAY;
            return avgRate(csSessions.filter(s => {
              const t = new Date(s.created_at).getTime();
              return t >= start && t < end;
            }));
          });

          // students for this course = students of this instructor (proxy until course enrollment table is wired)
          const courseStudentIds = (studentRelations || [])
            .filter(r => r.instructor_id === course.instructor_id)
            .map(r => r.student_id);
          const uniqueStudents = new Set(courseStudentIds);
          const studentCount = uniqueStudents.size;
          const activeCount = Array.from(uniqueStudents).filter(id => activeUserIds.has(id)).length;
          const sevenDayActiveRate = studentCount > 0 ? (activeCount / studentCount) * 100 : 0;
          const studentsDisengaging = Math.max(0, studentCount - activeCount);

          let signal: EngagementSignal = "steady";
          if (current > 0 && prior > 0 && current < prior * 0.7) signal = "dropping";
          else if (current > 0 && prior > 0 && current < prior * 0.9) signal = "softening";
          else if (current >= 70) signal = "strong";

          // grade context (avg across this instructor's students with grades — approximation)
          const grades: number[] = [];
          studentMetrics.forEach((m) => {
            if (m.instructorId === course.instructor_id && m.grades.length > 0) {
              grades.push(m.grades.reduce((a, b) => a + b, 0) / m.grades.length);
            }
          });
          const avgGrade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : null;

          return {
            id: course.id,
            title: course.title || "Untitled course",
            instructorName: instructorMap.get(course.instructor_id) || "Course team",
            studentCount,
            responseRateCurrent: current,
            responseRatePrior: prior,
            studentsDisengaging,
            sevenDayActiveRate,
            sparkline,
            signal,
            avgGrade,
            sessionsInWindow: csSessions.length,
          };
        });

        setCourseEngagement(engagement);
      } catch (e) {
        logger.error("Course engagement compute failed:", e);
        setCourseEngagement([]);
      }


      const engagementScore = totalStudents && totalStudents > 0
        ? ((activeStudents || 0) / totalStudents) * 100
        : 0;

      setStats({
        totalStudents: totalStudents || 0,
        activeStudents: activeStudents || 0,
        avgCompletionRate: studentMetrics.size > 0 ? totalCompletionRate / studentMetrics.size : 0,
      });

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

  const [syncing, setSyncing] = useState(false);
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_sync_org_members");
      if (error) throw error;
      const r = data || {};
      toast.success(
        `Sync complete · ${r.instructors_linked ?? 0} instructor(s), ${r.students_linked ?? 0} student(s) linked`
      );
      await fetchDashboardData();
    } catch (e: any) {
      logger.error("Sync failed", e);
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const navItems = [
    { value: "overview" as TabValue, label: "Overview", icon: LayoutDashboard },
    { value: "adoption" as TabValue, label: "Adoption", icon: BarChart3 },
    { value: "support" as TabValue, label: "Support Workflow", icon: HeartHandshake },
    { value: "settings" as TabValue, label: "Settings", icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading Leadership Console...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-sidebar-background flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-foreground">Edvana</h1>
              <p className="text-xs text-muted-foreground">Leadership Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.value}
              onClick={() => setActiveTab(item.value)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeTab === item.value
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span className="truncate">{adminName}</span>
          </div>
          <Button onClick={handleLogout} variant="ghost" size="sm" className="w-full justify-start mt-1">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {navItems.find((n) => n.value === activeTab)?.label || "Dashboard"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Institutional Analytics for Deans, Chairs & Administrators
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </Badge>
              <Button
                onClick={handleSyncNow}
                disabled={syncing || !orgId}
                size="sm"
                variant="outline"
                title="Re-sync instructors & their students into your organization"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {/* Filter bar + smart presets — adoption tab only */}
          {orgId && activeTab === "adoption" && (
            <div className="max-w-7xl mx-auto space-y-3 mb-6">
              <SmartPresetChips />
              <AdminFilterBar orgId={orgId} instructorIds={instructorIds} />
            </div>
          )}

          {activeTab === "overview" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* If no org yet, show creation flow front-and-center */}
              {!orgId && <OrganizationSetup onOrgCreated={fetchDashboardData} />}

              {orgId && (
                <>
                  {/* Governance chips */}
                  <GovernanceChips />

                  {/* Quick views */}
                  <SmartPresetChips />

                  {/* KPI cards */}
                  <AggregateMetricsCard
                    metrics={metrics}
                    loading={aggregateLoading}
                    hasAnyData={hasAnyData}
                    onConnect={() => setActiveTab("settings")}
                  />

                  {/* Usage Chart */}
                  <UsageOverTimeChart
                    data={weeklyUsage}
                    loading={aggregateLoading}
                    hasAnyData={hasAnyData}
                    onConnect={() => setActiveTab("settings")}
                  />

                  {/* Learning Insights */}
                  <LearningInsightsCard
                    misconceptions={filteredMisconceptions}
                    confidenceIssues={filteredConfidenceIssues}
                    loading={aggregateLoading}
                  />

                  {/* Export Reports */}
                  <ExportReportsCard data={stats} />
                </>
              )}
            </div>
          )}

          {activeTab === "adoption" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <InstructorPerformanceCard
                instructors={filteredInstructorPerf}
                loading={loading}
              />
            </div>
          )}

          {activeTab === "support" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <RetentionHealthCard
                atRiskCount={filteredAtRisk.length}
                totalStudents={stats.totalStudents}
                passRate={retentionMetrics.passRate}
                retentionRate={retentionMetrics.retentionRate}
                avgCompletionRate={retentionMetrics.avgCompletionRate}
              />
              <AtRiskStudentsTable students={filteredAtRisk} loading={loading} />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {orgId && <OrganizationSetup onOrgCreated={fetchDashboardData} />}
              <LMSIntegrationSettings mode="admin" />
            </div>
          )}

        </div>

        {/* Footer Disclaimer */}
        <footer className="border-t border-border bg-card px-6 py-3">
          <p className="text-xs text-muted-foreground text-center">
            Aggregate only • Formative (not graded) • Not faculty evaluation • Role-based access
          </p>
        </footer>
      </main>
    </div>
  );
}
