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
import { FloatingDecorations } from "@/components/student/FloatingDecorations";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import UserStats from "@/components/UserStats";
import ClassConnectionCard from "@/components/student/ClassConnectionCard";
import { Radio, Zap, BookOpen, GraduationCap, LogOut, Calendar, Sparkles } from "lucide-react";

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
    <div className="min-h-screen headspace-bg relative pb-24 md:pb-0">
      {/* Floating Decorations */}
      <FloatingDecorations />
      
      {/* Mobile Header */}
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={userStats}
      />

      {/* Desktop Header */}
      <header className="hidden md:block bg-card/80 backdrop-blur-sm sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Edvana</h1>
                <p className="text-xs text-muted-foreground">Your Learning Journey</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user?.id && <BadgesButton userId={user.id} />}
              <div className="h-8 w-px bg-border" />
              <span className="text-sm text-muted-foreground">
                {userName || user?.email}
              </span>
              <Button onClick={handleLogout} variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground rounded-full">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 relative z-10">
        {/* Headless achievement checker */}
        {user?.id && <AchievementSystem userId={user.id} />}
        
        {/* Bento Grid Layout - Headspace Style */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
          
          {/* Quick Stats - Mobile Only */}
          {user?.id && (
            <div className="md:hidden col-span-1 animate-fade-in">
              <UserStats userId={user.id} onStatsUpdate={setUserStats} />
            </div>
          )}

          {/* Join Live Session Card - Headspace Style */}
          <div className="col-span-1 md:col-span-8 animate-fade-in stagger-1">
            <div className="headspace-card p-6 md:p-8 bg-gradient-to-br from-secondary/10 to-secondary/5">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-7 h-7 text-secondary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-1">Join Live Session</h2>
                    <p className="text-muted-foreground">
                      Enter the 6-digit code from your instructor
                    </p>
                  </div>
                </div>
                <Button 
                  size="lg" 
                  className="w-full md:w-auto rounded-full px-8 bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-lg hover:shadow-xl transition-all"
                  onClick={() => navigate("/join")}
                >
                  Join Session
                </Button>
              </div>
            </div>
          </div>

          {/* Class Info Card */}
          <div className="col-span-1 md:col-span-4 animate-fade-in stagger-2">
            {user?.id && <ClassConnectionCard />}
          </div>

          {/* Train Card - Headspace Hero Style */}
          <div className="col-span-1 md:col-span-12 animate-fade-in stagger-3">
            <div className="headspace-card p-6 md:p-10 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 overflow-hidden relative">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-primary flex items-center justify-center flex-shrink-0 shadow-lg animate-gentle-bounce">
                    <Zap className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Train with Edvana</h2>
                    <p className="text-muted-foreground max-w-md">
                      Practice with AI-generated questions, track your progress, and climb the leaderboards
                    </p>
                  </div>
                </div>
                <Button 
                  size="lg" 
                  className="w-full md:w-auto text-base px-10 py-6 rounded-full shadow-xl hover:shadow-2xl transition-all bg-primary hover:bg-primary/90"
                  onClick={() => navigate("/training")}
                >
                  Start Training ✨
                </Button>
              </div>
            </div>
          </div>

          {/* Course Context - Headspace Style */}
          {courseContext.courseTitle && (
            <div className="col-span-1 md:col-span-6 animate-fade-in stagger-4">
              <div className="headspace-card p-6 h-full">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-foreground truncate">{courseContext.courseTitle}</h3>
                    {courseContext.courseSchedule && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Calendar className="w-4 h-4" />
                        {courseContext.courseSchedule}
                      </p>
                    )}
                  </div>
                </div>
                {courseContext.courseTopics && courseContext.courseTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {courseContext.courseTopics.slice(0, 5).map((topic, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs font-medium rounded-full px-3 py-1 bg-accent/50">
                        {topic}
                      </Badge>
                    ))}
                    {courseContext.courseTopics.length > 5 && (
                      <Badge variant="secondary" className="text-xs font-medium rounded-full px-3 py-1 bg-accent/50">
                        +{courseContext.courseTopics.length - 5} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flow State */}
          <div className={`col-span-1 ${courseContext.courseTitle ? 'md:col-span-6' : 'md:col-span-12'} animate-fade-in stagger-5`}>
            {user?.id && <FlowStateCard userId={user.id} />}
          </div>

          {/* Live Lecture Check-ins */}
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
