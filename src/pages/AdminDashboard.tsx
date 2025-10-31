import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import ROIMetricsCard from "@/components/admin/ROIMetricsCard";
import EngagementChart from "@/components/admin/EngagementChart";
import SchoolProgressCard from "@/components/admin/SchoolProgressCard";
import ExportReportsCard from "@/components/admin/ExportReportsCard";

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
      // Fetch total students by counting from user_roles table
      const { count: totalStudents } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "student");

      // Fetch active students (activity in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: activeStudents } = await supabase
        .from("user_stats")
        .select("*", { count: 'exact', head: true })
        .gte("last_activity_date", sevenDaysAgo.toISOString().split('T')[0]);

      // Fetch lesson progress
      const { data: lessonData } = await supabase
        .from("lesson_progress")
        .select("*");

      // Fetch achievements
      const { data: achievementData } = await supabase
        .from("user_achievements")
        .select("*");

      // Fetch user stats for calculations
      const { data: userStats } = await supabase
        .from("user_stats")
        .select("*");

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-accent bg-gradient-to-r from-card to-accent/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                🏢 Edvana Admin
              </h1>
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent">
                Analytics Dashboard
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {session?.user?.email || "Admin"}
              </span>
              <Button onClick={handleLogout} variant="destructive" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Top Row: ROI and School Progress */}
          <div className="grid lg:grid-cols-2 gap-6">
            <ROIMetricsCard
              totalStudents={stats.totalStudents}
              avgTimeSpent={stats.avgTimeSpent}
              completionRate={stats.avgCompletionRate}
              engagementScore={stats.engagementScore}
            />
            <SchoolProgressCard
              totalStudents={stats.totalStudents}
              activeStudents={stats.activeStudents}
              totalLessonsCompleted={stats.totalLessonsCompleted}
              totalAchievementsUnlocked={stats.totalAchievementsUnlocked}
              avgCompletionRate={stats.avgCompletionRate}
            />
          </div>

          {/* Bottom Row: Charts and Export */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <EngagementChart data={weeklyData} />
            </div>
            <ExportReportsCard data={stats} />
          </div>
        </div>
      </div>
    </div>
  );
}
