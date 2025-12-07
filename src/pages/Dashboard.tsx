import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AchievementSystem from "@/components/AchievementSystem";
import { BadgesButton } from "@/components/student/BadgesButton";
import { FlowStateCard } from "@/components/student/FlowStateCard";
import { AssignedContent } from "@/components/student/AssignedContent";
import { ConnectionDebugPanel } from "@/components/student/ConnectionDebugPanel";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import UserStats from "@/components/UserStats";
import ClassConnectionCard from "@/components/student/ClassConnectionCard";
import { Radio, Zap, BookOpen, GraduationCap, LogOut, Calendar } from "lucide-react";

interface User {
  id: string;
  email?: string;
}

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [courseContext, setCourseContext] = useState<{
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  }>({});
  const [userName, setUserName] = useState("");
  const [userStats, setUserStats] = useState({ level: 1, streak: 0 });
  const navigate = useNavigate();

  // Handle answer results for flow state visualization
  const handleAnswerResult = (isCorrect: boolean, grade: number) => {
    window.dispatchEvent(new CustomEvent('flowstate:answer', {
      detail: { isCorrect, grade }
    }));
  };

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
      fetchCourseContext();
      fetchUserProfile();
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

  const fetchCourseContext = async () => {
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
          .select("course_title, course_topics, course_schedule")
          .eq("id", connection.instructor_id)
          .single();

        if (instructorProfile) {
          setCourseContext({
            courseTitle: instructorProfile.course_title,
            courseTopics: instructorProfile.course_topics,
            courseSchedule: instructorProfile.course_schedule,
          });
        }
      }
    } catch (error) {
      logger.error("Error fetching course context:", error);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    localStorage.removeItem("lastCourseMaterialsReminder");
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    navigate("/");
  };

  if (!session || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background mesh-gradient pb-24 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={userStats}
      />

      {/* Desktop Header */}
      <header className="hidden md:block border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Edvana</h1>
                <p className="text-xs text-muted-foreground">Student Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user?.id && <BadgesButton userId={user.id} />}
              <div className="h-8 w-px bg-border" />
              <span className="text-sm text-muted-foreground">
                {userName || user?.email}
              </span>
              <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Headless achievement checker */}
        {user?.id && <AchievementSystem userId={user.id} />}
        
        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5">
          
          {/* Quick Stats - Mobile Only */}
          {user?.id && (
            <div className="md:hidden col-span-1 animate-fade-in">
              <UserStats userId={user.id} onStatsUpdate={setUserStats} />
            </div>
          )}

          {/* Join Live Session Card - Spans 8 cols on desktop */}
          <div className="col-span-1 md:col-span-8 animate-fade-in stagger-1">
            <div className="bento-card p-5 md:p-6 bg-gradient-to-br from-energy/5 to-energy/10 border-energy/20 hover:border-energy/40 transition-all group">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-energy/15 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Radio className="w-6 h-6 text-energy" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground mb-1">Join Live Session</h2>
                    <p className="text-sm text-muted-foreground">
                      Enter the 6-digit code from your instructor
                    </p>
                  </div>
                </div>
                <Button 
                  size="lg" 
                  className="w-full md:w-auto bg-energy hover:bg-energy/90 text-energy-foreground shadow-md hover:shadow-lg transition-all"
                  onClick={() => navigate("/join")}
                >
                  Join Session
                </Button>
              </div>
            </div>
          </div>

          {/* Class Info Card - Spans 4 cols */}
          <div className="col-span-1 md:col-span-4 animate-fade-in stagger-2">
            {user?.id && <ClassConnectionCard />}
          </div>

          {/* Train Card - Full Width */}
          <div className="col-span-1 md:col-span-12 animate-fade-in stagger-3">
            <div className="bento-card p-5 md:p-8 bg-gradient-to-br from-primary/5 via-primary/8 to-secondary/5 border-primary/20 hover:border-primary/40 transition-all group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer opacity-0 group-hover:opacity-100" />
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center flex-shrink-0 shadow-glow group-hover:scale-105 transition-transform">
                    <Zap className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground mb-1">Train with Edvana</h2>
                    <p className="text-muted-foreground">
                      Practice with AI-generated questions, track progress, and compete on leaderboards
                    </p>
                  </div>
                </div>
                <Button 
                  size="lg" 
                  className="w-full md:w-auto text-base px-8 shadow-lg hover:shadow-xl transition-all"
                  onClick={() => navigate("/training")}
                >
                  Start Training
                </Button>
              </div>
            </div>
          </div>

          {/* Course Context - Spans 6 cols */}
          {courseContext.courseTitle && (
            <div className="col-span-1 md:col-span-6 animate-fade-in stagger-4">
              <div className="bento-card p-5 h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-foreground truncate">{courseContext.courseTitle}</h3>
                    {courseContext.courseSchedule && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {courseContext.courseSchedule}
                      </p>
                    )}
                  </div>
                </div>
                {courseContext.courseTopics && courseContext.courseTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {courseContext.courseTopics.slice(0, 5).map((topic, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs font-normal bg-muted/50">
                        {topic}
                      </Badge>
                    ))}
                    {courseContext.courseTopics.length > 5 && (
                      <Badge variant="secondary" className="text-xs font-normal bg-muted/50">
                        +{courseContext.courseTopics.length - 5} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flow State - Spans remaining cols */}
          <div className={`col-span-1 ${courseContext.courseTitle ? 'md:col-span-6' : 'md:col-span-12'} animate-fade-in stagger-5`}>
            {user?.id && <FlowStateCard userId={user.id} />}
          </div>

          {/* Live Lecture Check-ins - Full Width */}
          <div className="col-span-1 md:col-span-12 animate-fade-in stagger-6">
            {user?.id && <AssignedContent userId={user.id} onAnswerResult={handleAnswerResult} />}
          </div>
        </div>
      </div>

      {/* Connection Debug Panel */}
      {user?.id && <ConnectionDebugPanel userId={user.id} />}

      {/* Mobile Bottom Navigation */}
      <BottomNav role="student" />
    </div>
  );
}
