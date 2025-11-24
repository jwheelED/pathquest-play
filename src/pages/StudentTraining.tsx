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
import { StudyGroups } from "@/components/student/StudyGroups";
import { AdaptiveDifficultyIndicator } from "@/components/student/AdaptiveDifficultyIndicator";
import { useAdaptiveDifficulty } from "@/hooks/useAdaptiveDifficulty";
import STEMPractice from "@/components/STEMPractice";
import { logger } from "@/lib/logger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

interface User {
  id: string;
  email?: string;
}

interface ClassOption {
  instructorId: string;
  courseTitle: string;
  instructorName: string;
}

export default function StudentTraining() {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [userStats, setUserStats] = useState({ level: 1, streak: 0 });
  const [materialRefreshKey, setMaterialRefreshKey] = useState(0);
  const [selectedMaterialClass, setSelectedMaterialClass] = useState<string>("all");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [courseContext, setCourseContext] = useState<{
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  }>({});
  const navigate = useNavigate();
  
  // Get adaptive difficulty for the user
  const { currentDifficulty } = useAdaptiveDifficulty(user?.id);

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
      fetchUserClasses(session.user.id);
    }
  };

  const fetchUserClasses = async (userId: string) => {
    try {
      const { data: connections, error } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (error) throw error;

      if (!connections || connections.length === 0) {
        setClasses([]);
        return;
      }

      const classPromises = connections.map(async (conn) => {
        const { data: instructor } = await supabase
          .from("profiles")
          .select("full_name, course_title")
          .eq("id", conn.instructor_id)
          .single();

        return {
          instructorId: conn.instructor_id,
          courseTitle: instructor?.course_title || "Unknown Course",
          instructorName: instructor?.full_name || "Unknown Instructor",
        };
      });

      const classData = await Promise.all(classPromises);
      setClasses(classData);
    } catch (error: any) {
      logger.error("Error fetching classes:", error);
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
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {user?.email || "User"}
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className="space-y-4 md:space-y-6">
          {/* Class Selector */}
          {user?.id && <ClassSelector userId={user.id} />}

          {/* Onboarding Card for Students Without Classes */}
          {classes.length === 0 && (
            <div className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
                  <span className="text-3xl">📚</span>
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold text-foreground">
                    Get Personalized Practice Questions
                  </h3>
                  <p className="text-muted-foreground">
                    Upload your study materials (notes, PDFs, images) to automatically generate AI-powered practice questions tailored to your content. No class connection needed!
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="default" 
                      onClick={() => {
                        document.getElementById('study-materials-section')?.scrollIntoView({ 
                          behavior: 'smooth',
                          block: 'start'
                        });
                      }}
                    >
                      Upload Materials Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gamification Section */}
          {user?.id && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyChallenges userId={user.id} />
              <PracticeGoals userId={user.id} />
            </div>
          )}

          {/* Leaderboard */}
          {user?.id && <Leaderboard userId={user.id} />}

          {/* Study Groups Section */}
          {user?.id && <StudyGroups userId={user.id} />}

          {/* AI-Powered Practice Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              🎯 Practice with AI-Generated Questions
            </h2>
            
            {/* Adaptive Difficulty Indicator */}
            {user?.id && (
              <AdaptiveDifficultyIndicator userId={user.id} />
            )}
            
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
          <div id="study-materials-section" className="space-y-4 scroll-mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                📚 My Study Materials
              </h2>
              {classes.length > 0 && (
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={selectedMaterialClass} onValueChange={setSelectedMaterialClass}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes.map((classOption) => (
                        <SelectItem key={classOption.instructorId} value={classOption.instructorId}>
                          {classOption.courseTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {user?.id && (
              <>
                <StudyMaterialUpload 
                  userId={user.id} 
                  onUploadComplete={() => setMaterialRefreshKey(prev => prev + 1)}
                  adaptiveDifficulty={currentDifficulty}
                />
                <StudyMaterialLibrary 
                  userId={user.id} 
                  instructorId={selectedMaterialClass !== "all" ? selectedMaterialClass : undefined}
                  refreshKey={materialRefreshKey} 
                />
                <MaterialQuestionStats 
                  userId={user.id}
                  instructorId={selectedMaterialClass !== "all" ? selectedMaterialClass : undefined}
                  onGenerateQuestions={() => setMaterialRefreshKey(prev => prev + 1)}
                  adaptiveDifficulty={currentDifficulty}
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
