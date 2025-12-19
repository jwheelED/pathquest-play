import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AchievementSystem from "@/components/AchievementSystem";
import { BadgesButton } from "@/components/student/BadgesButton";
import { ConnectionDebugPanel } from "@/components/student/ConnectionDebugPanel";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { ReadinessMeter } from "@/components/student/ReadinessMeter";
import { LearningPathFeed } from "@/components/student/LearningPathFeed";
import { TestOutGate } from "@/components/student/TestOutGate";
import { QuickUploadSheet } from "@/components/student/QuickUploadSheet";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { LogOut, Sparkles, Upload, Radio, Plus } from "lucide-react";

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
    // Navigate to first priority item or training
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

  return (
    <div className="min-h-screen mastery-bg pb-24 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        userId={user.id}
        stats={userStats}
      />

      {/* Desktop Header - Compact */}
      <header className="hidden md:block bg-card/80 backdrop-blur-sm sticky top-0 z-40 border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Edvana</h1>
                {className && (
                  <p className="text-xs text-muted-foreground">{className}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Join Live Session - Small */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/join")}
                className="rounded-full gap-2 text-xs"
              >
                <Radio className="w-3 h-3" />
                Join Live
              </Button>

              {/* Upload - Quick Upload Sheet */}
              <QuickUploadSheet
                userId={user.id}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-8 h-8"
                    title="Upload Materials"
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                }
              />

              {user?.id && <BadgesButton userId={user.id} />}
              
              <div className="h-6 w-px bg-border" />
              
              <span className="text-sm text-muted-foreground hidden lg:block">
                {userName || user?.email}
              </span>
              
              <Button 
                onClick={handleLogout} 
                variant="ghost" 
                size="icon" 
                className="rounded-full w-8 h-8 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Single Stream */}
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Headless achievement checker */}
        {user?.id && <AchievementSystem userId={user.id} />}

        {/* Hero Section - Readiness Meter */}
        <section className="mb-8 md:mb-12 animate-fade-in">
          <div className="bg-card rounded-3xl p-6 md:p-10 border border-border/50 shadow-lg">
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

        {/* Unified Learning Stream */}
        <section className="animate-fade-in stagger-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 px-2">
            Your Learning Path
          </h2>
          <LearningPathFeed
            userId={user.id}
            onNavigate={handleNavigate}
            onUpload={() => setUploadSheetOpen(true)}
          />
        </section>
      </main>

      {/* Floating Action Button for Upload - visible on all screens */}
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

      {/* Mobile Bottom Navigation */}
      <BottomNav role="student" />
    </div>
  );
}
