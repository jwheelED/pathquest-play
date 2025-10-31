import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import UserStats from "@/components/UserStats";
import STEMPractice from "@/components/STEMPractice";
import AchievementSystem from "@/components/AchievementSystem";
import { AchievementBadges } from "@/components/student/AchievementBadges";
import { BadgeShowcase } from "@/components/student/BadgeShowcase";
import GameifiedLessons from "@/components/GameifiedLessons";
import JoinClassCard from "@/components/JoinClassCard";
import InstructorChatCard from "@/components/InstructorChatCard";
import { AssignedContent } from "@/components/student/AssignedContent";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface User {
  id: string;
  email?: string;
}

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [courseContext, setCourseContext] = useState<{
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  }>({});
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

  useEffect(() => {
    if (user?.id) {
      checkOnboarding();
      fetchCourseContext();
    }
  }, [user]);

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
    
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .single();

    if (error || !data?.onboarded) {
      navigate("/onboarding");
    }
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
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    navigate("/");
  };

  const handlePointsEarned = (points: number) => {
    logger.info(`Points earned: ${points}`);
  };

  const handleJoinClass = async (classCode: string) => {
    if (!user?.id || !classCode.trim()) return;
    
    try {
      // Use secure RPC function to validate instructor code
      const { data: instructorId, error: instructorError } = await supabase
        .rpc("validate_instructor_code", { code: classCode.trim() });

      if (instructorError || !instructorId) {
        toast.error("Invalid class code. Please check and try again.");
        return;
      }

      const { data: existing } = await supabase
        .from("instructor_students")
        .select("id")
        .eq("instructor_id", instructorId)
        .eq("student_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.info("You're already connected to this instructor.");
        return;
      }

      const { error: connectionError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: instructorId,
          student_id: user.id,
        });

      if (connectionError) {
        toast.error("Failed to connect to instructor.");
        logger.error("Connection error:", connectionError);
        return;
      }

      toast.success("Successfully connected to your instructor!");
      // Trigger refresh of InstructorChatCard and course context
      setRefreshKey(prev => prev + 1);
      fetchCourseContext();
    } catch (err) {
      logger.error("Error joining class:", err);
      toast.error("An error occurred. Please try again.");
    }
  };

  if (!session || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-primary bg-gradient-to-r from-card to-primary/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-pulse-glow">
                🎮 Edvana
              </h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                Dashboard
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {user.email || "User"}
              </span>
              <Button onClick={handleLogout} variant="destructive" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <aside className="lg:col-span-3 space-y-6">
            <UserStats userId={user.id} />
            
            {/* Achievement Badges - Only visible to student */}
            <AchievementBadges userId={user.id} />
            
            <Card className="p-4 bg-gradient-to-br from-card to-accent/20">
              <div className="space-y-3">
                <Button variant="retro" size="lg" className="w-full">
                  🏠 Home
                </Button>
                <Button variant="neon" size="lg" className="w-full">
                  🔍 Explore
                </Button>
                <Button variant="achievement" size="lg" className="w-full">
                  🏆 Achievements
                </Button>
              </div>
            </Card>

            <AchievementSystem userId={user.id} />
          </aside>

          <main className="lg:col-span-9 space-y-6">
            
            {courseContext.courseTitle && (
              <Card className="p-6 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/30">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                  📚 {courseContext.courseTitle}
                </h2>
                {courseContext.courseTopics && courseContext.courseTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {courseContext.courseTopics.map((topic, idx) => (
                      <Badge key={idx} variant="secondary">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
                {courseContext.courseSchedule && (
                  <p className="text-sm text-muted-foreground">
                    📅 {courseContext.courseSchedule}
                  </p>
                )}
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 bg-gradient-secondary border-2 border-secondary-glow text-center">
                <div className="text-2xl font-bold text-secondary-foreground">📊</div>
                <div className="text-xl font-bold text-secondary-foreground">{progress.toFixed(0)}%</div>
                <div className="text-sm text-secondary-foreground/80">Course Progress</div>
              </Card>
              
              <Card className="p-4 bg-gradient-achievement border-2 border-achievement-glow text-center">
                <div className="text-2xl font-bold text-achievement-foreground">🎓</div>
                <div className="text-xl font-bold text-achievement-foreground">
                  {courseContext.courseTitle ? "Enrolled" : "Not Enrolled"}
                </div>
                <div className="text-sm text-achievement-foreground/80">Class Status</div>
              </Card>
            </div>

            {!courseContext.courseTitle && (
              <JoinClassCard onJoinClass={handleJoinClass} />
            )}
            
            <AssignedContent userId={user.id} />

            <BadgeShowcase userId={user.id} />

            <STEMPractice 
              userId={user.id} 
              onPointsEarned={handlePointsEarned}
              courseContext={courseContext}
            />

            <InstructorChatCard key={refreshKey} userId={user.id} />
            
          </main>
        </div>
      </div>
    </div>
  );
}