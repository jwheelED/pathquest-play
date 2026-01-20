import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, BookOpen, Upload, Filter, Radio, Trophy, Plus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickActions } from "@/components/dashboard/QuickActions";
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
import { ReadinessMeter } from "@/components/student/ReadinessMeter";
import { StreakWidget } from "@/components/student/StreakWidget";
import { QuickStatsBar } from "@/components/student/QuickStatsBar";
import { StudyPlanHeader } from "@/components/student/StudyPlanHeader";
import { QuickUploadSheet } from "@/components/student/QuickUploadSheet";
import { BadgesDialog } from "@/components/student/BadgesButton";

import { ConnectionDebugPanel } from "@/components/student/ConnectionDebugPanel";
import AchievementSystem from "@/components/AchievementSystem";
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
  const [className, setClassName] = useState<string>("");
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [courseContext, setCourseContext] = useState<{
    courseTitle?: string;
    courseTopics?: string[];
    courseSchedule?: string;
  }>({});
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get adaptive difficulty for the user
  const { currentDifficulty } = useAdaptiveDifficulty(user?.id);

  // Handle hash-based navigation for badges
  useEffect(() => {
    if (location.hash === '#badges' && user?.id) {
      setBadgesOpen(true);
      // Clear the hash after opening
      window.history.replaceState(null, '', location.pathname);
    }
  }, [location.hash, user?.id]);

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
      
      // Set first class name for header subtitle
      if (classData.length > 0) {
        setClassName(classData[0].courseTitle);
      }
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
      onClick: () => {
        document.getElementById('study-materials-section')?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      },
    },
    {
      icon: <Trophy className="w-3 h-3" />,
      label: "Badges",
      onClick: () => setBadgesOpen(true),
    },
  ];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-soft text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardShell
      role="student"
      userName={userName || user.email || "Student"}
      userEmail={user.email || ""}
      userId={user.id}
      onLogout={handleLogout}
      stats={userStats}
      title="Edvana Student"
      subtitle={className}
      headerActions={
        <QuickActions actions={quickActions} className="hidden lg:flex" />
      }
    >
      {/* Badges Dialog */}
      {user?.id && (
        <BadgesDialog 
          userId={user.id} 
          open={badgesOpen} 
          onOpenChange={setBadgesOpen} 
        />
      )}

      {/* Headless achievement checker */}
      {user?.id && <AchievementSystem userId={user.id} />}
      
      {/* Floating Decorations */}
      <FloatingDecorations variant="minimal" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Study Plan Header */}
        <StudyPlanHeader userId={user.id} />
        
        {/* Quick Stats Bar */}
        <section className="mb-6 animate-fade-in">
          <QuickStatsBar userId={user.id} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
          
          {/* Class Selector */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in">
            {user?.id && <ClassSelector userId={user.id} />}
          </div>

          {/* Readiness Meter - Now a feature card, not hero */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-1">
            <div className="headspace-card rounded-3xl p-5 border border-border/50 h-full">
              <ReadinessMeter userId={user.id} />
            </div>
          </div>

          {/* Streak Widget */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-1">
            <StreakWidget userId={user.id} />
          </div>

          {/* Daily Challenges */}
          <div className="col-span-1 lg:col-span-4 animate-fade-in stagger-1">
            {user?.id && <DailyChallenges userId={user.id} />}
          </div>

          {/* Onboarding Card for Students Without Classes */}
          {classes.length === 0 && (
            <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-2">
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
                      Upload your study materials (notes, PDFs, images) to automatically generate personalized practice questions tailored to your content. No class connection needed!
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

          {/* Daily Review Dashboard */}
          <div className="col-span-1 lg:col-span-6 animate-fade-in stagger-2">
            {user?.id && <ReviewDashboard userId={user.id} />}
          </div>


          {/* Study Groups Section */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-3">
            {user?.id && <StudyGroups userId={user.id} />}
          </div>

          {/* AI-Powered Practice Section */}
          <div id="practice-section" className="col-span-1 lg:col-span-12 animate-fade-in stagger-4 scroll-mt-4">
            <div className="headspace-card p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-14 h-14 rounded-3xl bg-secondary/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-secondary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-1">Practice with Smart Questions</h2>
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

      <BottomNav role="student" />
    </DashboardShell>
  );
}
