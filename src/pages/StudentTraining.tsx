import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Target, Trophy, BookOpen, Users, BarChart3, Upload, Filter } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { DailyChallenges } from "@/components/student/DailyChallenges";
import { Leaderboard } from "@/components/student/Leaderboard";
import { ConfidenceAnalytics } from "@/components/student/ConfidenceAnalytics";
import { StudyMaterialUpload } from "@/components/student/StudyMaterialUpload";
import { StudyMaterialLibrary } from "@/components/student/StudyMaterialLibrary";
import { MaterialQuestionStats } from "@/components/student/MaterialQuestionStats";
import { ClassSelector } from "@/components/student/ClassSelector";
import { StudyGroups } from "@/components/student/StudyGroups";
import { AdaptiveDifficultyIndicator } from "@/components/student/AdaptiveDifficultyIndicator";
import { FloatingDecorations } from "@/components/student/FloatingDecorations";
import { ReviewDashboard } from "@/components/student/ReviewDashboard";
import { useAdaptiveDifficulty } from "@/hooks/useAdaptiveDifficulty";
import STEMPractice from "@/components/STEMPractice";
import { logger } from "@/lib/logger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen headspace-bg relative pb-20 md:pb-0">
      {/* Floating Decorations */}
      <FloatingDecorations variant="minimal" />
      
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={userStats}
      />

      {/* Desktop Header */}
      <header className="hidden md:block bg-card/80 backdrop-blur-sm shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/?stay=true")}
                  className="gap-2 rounded-full hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Home
                </Button>
                <span className="text-muted-foreground">/</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  className="gap-2 rounded-full hover:bg-accent"
                >
                  Dashboard
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-bold text-foreground">
                  Edvana Training
                </h1>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {userName || user?.email || "User"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
          
          {/* Class Selector */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in">
            {user?.id && <ClassSelector userId={user.id} />}
          </div>

          {/* Onboarding Card for Students Without Classes */}
          {classes.length === 0 && (
            <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-1">
              <div className="headspace-card p-6 bg-gradient-to-br from-primary/10 to-accent/10">
                <div className="flex flex-col md:flex-row items-start gap-5">
                  <div className="w-14 h-14 rounded-3xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Upload className="w-7 h-7 text-primary" />
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
                        className="rounded-full"
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
            </div>
          )}

          {/* Daily Challenges */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-1">
            {user?.id && <DailyChallenges userId={user.id} />}
          </div>

          {/* Daily Review Dashboard */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-1">
            {user?.id && <ReviewDashboard userId={user.id} />}
          </div>

          {/* Leaderboard */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-2">
            {user?.id && <Leaderboard userId={user.id} />}
          </div>

          {/* Study Groups Section */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-3">
            {user?.id && <StudyGroups userId={user.id} />}
          </div>

          {/* AI-Powered Practice Section */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-4">
            <div className="headspace-card p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-14 h-14 rounded-3xl bg-secondary/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-secondary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-1">Practice with AI-Generated Questions</h2>
                  <p className="text-muted-foreground text-sm">
                    Questions adapt to your skill level as you practice
                  </p>
                </div>
              </div>
              
              {/* Adaptive Difficulty Indicator */}
              {user?.id && (
                <div className="mb-4">
                  <AdaptiveDifficultyIndicator userId={user.id} />
                </div>
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
          </div>

          {/* Study Materials Section */}
          <div id="study-materials-section" className="col-span-1 lg:col-span-12 animate-fade-in stagger-5 scroll-mt-4">
            <div className="headspace-card p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-3xl bg-accent flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-7 h-7 text-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-1">My Study Materials</h2>
                    <p className="text-muted-foreground text-sm">
                      Upload materials to generate personalized questions
                    </p>
                  </div>
                </div>
                {classes.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <Select value={selectedMaterialClass} onValueChange={setSelectedMaterialClass}>
                      <SelectTrigger className="w-[200px] rounded-full">
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
                <div className="space-y-4">
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
                </div>
              )}
            </div>
          </div>

          {/* Confidence Analytics */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-6">
            {user?.id && <ConfidenceAnalytics userId={user.id} />}
          </div>
        </div>
      </div>

      <BottomNav role="student" />
    </div>
  );
}
