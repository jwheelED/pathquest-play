import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AchievementSystem from "@/components/AchievementSystem";
import { BadgesButton } from "@/components/student/BadgesButton";
import { ConnectionDebugPanel } from "@/components/student/ConnectionDebugPanel";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ReadinessMeter } from "@/components/student/ReadinessMeter";
import { LearningPathFeed } from "@/components/student/LearningPathFeed";
import { TestOutGate } from "@/components/student/TestOutGate";
import { QuickUploadSheet } from "@/components/student/QuickUploadSheet";
import { StudyPlanHeader } from "@/components/student/StudyPlanHeader";
import { StreakWidget } from "@/components/student/StreakWidget";
import { QuickStatsBar } from "@/components/student/QuickStatsBar";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Radio, Plus, Upload, Trophy } from "lucide-react";

interface User {
  id: string;
  email?: string;
}

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [userStats, setUserStats] = useState({ level: 1, streak: 0 });
  const [className, setClassName] = useState<string>("");
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user || null);
        
        if (!session) {
          navigate("/");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Auto-verify session every 5 minutes
  useEffect(() => {
    const verifySession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        logger.error("Session verification failed:", error);
        toast.error("Your session has expired. Please login again.", {
          duration: 10000,
          action: {
            label: "Logout",
            onClick: handleLogout
          }
        });
      }
    };

    verifySession();
    const interval = setInterval(verifySession, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);

  useEffect(() => {
    if (user?.id && !hasCheckedOnboarding) {
      setHasCheckedOnboarding(true);
      checkOnboarding();
      fetchUserProfile();
      fetchClassName();
    }
  }, [user, hasCheckedOnboarding]);

  const fetchUserProfile = async () => {
    if (!user?.id) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    
    if (data?.full_name) {
      setUserName(data.full_name);
    }
  };

  const fetchClassName = async () => {
    if (!user?.id) return;
    
    try {
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", user.id)
        .maybeSingle();

      if (connection?.instructor_id) {
        const { data: instructorProfile } = await supabase
          .from("profiles")
          .select("course_title")
          .eq("id", connection.instructor_id)
          .single();

        if (instructorProfile?.course_title) {
          setClassName(instructorProfile.course_title);
        }
      }
    } catch (error) {
      logger.error("Error fetching class name:", error);
    }
  };

  const checkSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/");
    } else {
      setSession(data.session);
      setUser(data.session.user);
    }
  };

  const checkOnboarding = async () => {
    if (!user?.id) return;
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarded) {
      localStorage.removeItem("edvana_onboarded");
      navigate("/onboarding");
      return;
    }

    localStorage.setItem("edvana_onboarded", "true");
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    localStorage.removeItem("lastCourseMaterialsReminder");
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    navigate("/");
  };

  const handleContinuePath = () => {
    navigate("/training");
  };

  const handleTestOut = () => {
    toast.info("Test Out feature coming soon!", {
      description: "Challenge yourself to skip ahead in your learning path."
    });
  };

  const handleNavigate = (path: string, state?: any) => {
    navigate(path, { state });
  };

  if (!session || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const quickActions = [
    {
      icon: <Radio className="w-3 h-3" />,
      label: "Join Live",
      onClick: () => navigate("/join"),
      variant: "primary" as const,
    },
    {
      icon: <Upload className="w-3 h-3" />,
      label: "Upload",
      onClick: () => setUploadSheetOpen(true),
    },
    {
      icon: <Trophy className="w-3 h-3" />,
      label: "Badges",
      onClick: () => navigate("/dashboard#badges"),
    },
  ];

  return (
    <DashboardShell
      role="student"
      userName={userName || user.email || "Student"}
      userEmail={user.email || ""}
      userId={user.id}
      onLogout={handleLogout}
      stats={userStats}
      title="Edvana"
      subtitle={className}
      headerActions={
        <>
          <QuickActions actions={quickActions} className="hidden lg:flex" />
          {user?.id && <BadgesButton userId={user.id} />}
        </>
      }
    >
      {/* Headless achievement checker */}
      {user?.id && <AchievementSystem userId={user.id} />}

      <div className="max-w-3xl mx-auto">
        {/* Today's Date & Study Plan Progress */}
        <StudyPlanHeader userId={user.id} />

        {/* Quick Stats Bar - Mobile prominent */}
        <section className="mb-6 animate-fade-in">
          <QuickStatsBar userId={user.id} />
        </section>

        {/* Two Column Layout on larger screens */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero Section - Readiness Meter */}
            <section className="animate-fade-in">
              <div className="headspace-card rounded-3xl p-6 md:p-8 border border-border/50">
                <ReadinessMeter
                  userId={user.id}
                  onContinue={handleContinuePath}
                />
              </div>
            </section>

            {/* Test Out Gate */}
            <section className="animate-fade-in stagger-1">
              <TestOutGate onTestOut={handleTestOut} />
            </section>
          </div>

          {/* Sidebar - Streak Widget */}
          <div className="lg:col-span-1 space-y-6">
            <section className="animate-fade-in stagger-1">
              <StreakWidget userId={user.id} />
            </section>
          </div>
        </div>

        {/* Unified Learning Stream */}
        <section className="animate-fade-in stagger-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 px-2">
            Today's Tasks
          </h2>
          <LearningPathFeed
            userId={user.id}
            onNavigate={handleNavigate}
            onUpload={() => setUploadSheetOpen(true)}
          />
        </section>
      </div>

      {/* Floating Action Button for Upload */}
      <div className="fixed bottom-24 right-4 z-50 md:bottom-8 md:right-8">
        <QuickUploadSheet
          userId={user.id}
          trigger={
            <Button
              size="lg"
              className="rounded-full w-14 h-14 shadow-xl bg-primary hover:bg-primary/90"
            >
              <Plus className="w-6 h-6" />
            </Button>
          }
        />
      </div>

      {/* Connection Debug Panel */}
      {user?.id && <ConnectionDebugPanel userId={user.id} />}
    </DashboardShell>
  );
}
