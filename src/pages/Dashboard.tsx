import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AchievementSystem from "@/components/AchievementSystem";
import { BadgesButton } from "@/components/student/BadgesButton";
import InstructorChatCard from "@/components/InstructorChatCard";
import { AssignedContent } from "@/components/student/AssignedContent";
import { ConnectionDebugPanel } from "@/components/student/ConnectionDebugPanel";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import UserStats from "@/components/UserStats";

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

    // Initial check
    verifySession();
    
    // Check every 5 minutes
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
    
    // Always check database - cache is unreliable after instructor re-onboarding
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarded) {
      // Clear stale cache
      localStorage.removeItem("edvana_onboarded");
      navigate("/onboarding");
      return;
    }

    // Check if student has a valid instructor connection
    const { data: connection } = await supabase
      .from("instructor_students")
      .select("instructor_id")
      .eq("student_id", user.id)
      .maybeSingle();

    if (!connection) {
      // Student is onboarded but has no instructor connection - allow re-onboarding
      logger.warn("Student has no instructor connection, redirecting to onboarding");
      localStorage.removeItem("edvana_onboarded");
      toast.error("Your class connection is missing. Please re-enter your class code.");
      navigate("/onboarding");
      return;
    }

    // Update cache
    localStorage.setItem("edvana_onboarded", "true");
  };

  const fetchCourseContext = async () => {
    if (!user?.id) return;
    
    try {
      // Get instructor connection
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", user.id)
        .maybeSingle();

      if (connection?.instructor_id) {
        // Fetch instructor's course info
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
    // Clear ALL cached onboarding data
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
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={userStats}
      />

      {/* Desktop Header */}
      <header className="hidden md:block border-b-2 border-primary bg-gradient-to-r from-card to-primary/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-pulse-glow">
                🎤 Edvana
              </h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                Student Dashboard
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              {user?.id && <BadgesButton userId={user.id} />}
              <span className="text-sm text-muted-foreground">
                {user?.email || "User"}
              </span>
              <Button 
                onClick={() => {
                  localStorage.removeItem("edvana_onboarded");
                  navigate("/onboarding");
                }} 
                variant="outline" 
                size="sm"
              >
                Switch Class
              </Button>
              <Button onClick={handleLogout} variant="destructive" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Headless achievement checker - only triggers pop-ups */}
        {user?.id && <AchievementSystem userId={user.id} />}
        
        {/* Mobile Stats Card */}
        {user?.id && (
          <div className="md:hidden mb-4">
            <UserStats userId={user.id} onStatsUpdate={setUserStats} />
          </div>
        )}
        
        <div className="space-y-4 md:space-y-6">
          {courseContext.courseTitle && (
            <Card className="p-4 md:p-6 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/30">
              <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2">
                📚 {courseContext.courseTitle}
              </h2>
              {courseContext.courseTopics && courseContext.courseTopics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {courseContext.courseTopics.map((topic, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              )}
              {courseContext.courseSchedule && (
                <p className="text-xs md:text-sm text-muted-foreground">
                  📅 {courseContext.courseSchedule}
                </p>
              )}
            </Card>
          )}
          
          {/* Live Lecture Check-ins - Most Important Section */}
          {user?.id && <AssignedContent userId={user.id} />}

          {user?.id && <InstructorChatCard key={refreshKey} userId={user.id} />}
        </div>
      </div>

      {/* Connection Debug Panel */}
      {user?.id && <ConnectionDebugPanel userId={user.id} />}

      {/* Mobile Bottom Navigation */}
      <BottomNav role="student" />
    </div>
  );
}