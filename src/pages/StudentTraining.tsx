import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { DailyChallenges } from "@/components/student/DailyChallenges";
import { PracticeGoals } from "@/components/student/PracticeGoals";
import { Leaderboard } from "@/components/student/Leaderboard";
import { ConfidenceAnalytics } from "@/components/student/ConfidenceAnalytics";
import { StudyMaterialUpload } from "@/components/student/StudyMaterialUpload";
import { StudyMaterialLibrary } from "@/components/student/StudyMaterialLibrary";
import { MaterialQuestionStats } from "@/components/student/MaterialQuestionStats";
import { ClassSelector } from "@/components/student/ClassSelector";
import STEMPractice from "@/components/STEMPractice";
import { logger } from "@/lib/logger";

interface User {
  id: string;
  email?: string;
}

export default function StudentTraining() {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [userStats, setUserStats] = useState({ level: 1, streak: 0 });
  const [materialRefreshKey, setMaterialRefreshKey] = useState(0);
  const [courseContext, setCourseContext] = useState<{
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  }>({});
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      fetchUserProfile(session.user.id);
      fetchCourseContext(session.user.id);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    
    if (data?.full_name) {
      setUserName(data.full_name);
    }
  };

  const fetchCourseContext = async (userId: string) => {
    try {
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId)
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
    navigate("/");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={userStats}
      />

      <header className="hidden md:block border-b-2 border-primary bg-gradient-to-r from-card to-primary/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-pulse-glow">
                🎯 Edvana Training
              </h1>
            </div>
            <span className="text-sm text-muted-foreground">
              {user?.email || "User"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className="space-y-4 md:space-y-6">
          {/* Class Selector */}
          {user?.id && <ClassSelector userId={user.id} />}

          {/* Gamification Section */}
          {user?.id && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyChallenges userId={user.id} />
              <PracticeGoals userId={user.id} />
            </div>
          )}

          {/* Leaderboard */}
          {user?.id && <Leaderboard userId={user.id} />}

          {/* AI-Powered Practice Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              🎯 Practice with AI-Generated Questions
            </h2>
            {user?.id && (
              <STEMPractice 
                userId={user.id}
                courseContext={courseContext}
                onPointsEarned={(points) => {
                  // Trigger stats refresh
                }}
              />
            )}
          </div>

          {/* Study Materials Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              📚 My Study Materials
            </h2>
            {user?.id && (
              <>
                <StudyMaterialUpload 
                  userId={user.id} 
                  onUploadComplete={() => setMaterialRefreshKey(prev => prev + 1)}
                />
                <StudyMaterialLibrary userId={user.id} refreshKey={materialRefreshKey} />
                <MaterialQuestionStats 
                  userId={user.id}
                  onGenerateQuestions={() => setMaterialRefreshKey(prev => prev + 1)}
                />
              </>
            )}
          </div>

          {/* Confidence Analytics */}
          {user?.id && <ConfidenceAnalytics userId={user.id} />}
        </div>
      </div>

      <BottomNav role="student" />
    </div>
  );
}
