import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, BookOpen, Presentation, Video, Radio, Copy, LayoutDashboard, Users, FileText, Library } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { InstructorOverview } from "@/components/instructor/InstructorOverview";
import { CourseSelector } from "@/components/instructor/CourseSelector";
import StudentRankingCard from "@/components/instructor/StudentRankingCard";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";
import { AcademicIntegrityInsights } from "@/components/instructor/AcademicIntegrityInsights";
import { LectureTranscription } from "@/components/instructor/LectureTranscription";
import { LectureCheckInResults } from "@/components/instructor/LectureCheckInResults";
import { AnswerReleaseCard } from "@/components/instructor/AnswerReleaseCard";
import { LectureMaterialsUpload } from "@/components/instructor/LectureMaterialsUpload";
// InstructorConnectionCard removed - organization connection not needed unless for institutional licensing
import { LiveSessionControls } from "@/components/instructor/LiveSessionControls";
import { PreRecordedLectureUpload } from "@/components/instructor/PreRecordedLectureUpload";
import { LectureVideoManager } from "@/components/instructor/LectureVideoManager";
import { PreRecordedLectureGrades } from "@/components/instructor/PreRecordedLectureGrades";
import { QuestionBankManager } from "@/components/instructor/question-bank";
import { cn } from "@/lib/utils";
import { useCourseContext } from "@/hooks/useCourseContext";

interface Student {
  id: string;
  name: string;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
  averageMasteryAttempts?: number;
  average_grade?: number;
}

type TabValue = "overview" | "live" | "recorded" | "students" | "materials" | "question-bank";

const baseNavItems: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "live", label: "Live Lecture", icon: Radio },
  { value: "question-bank", label: "Question Bank", icon: Library },
  { value: "recorded", label: "Pre-Recorded", icon: Video },
  { value: "students", label: "Students", icon: Users },
  { value: "materials", label: "Materials", icon: FileText },
];

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [instructorCode, setInstructorCode] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshQueue, setRefreshQueue] = useState(0);
  const [instructorProfile, setInstructorProfile] = useState<any>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const fetchDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const { selectedCourseId, selectedCourse } = useCourseContext();
  
  const professorType = instructorProfile?.professor_type;
  
  // All instructors get access to all nav items
  const navItems = baseNavItems;

  useEffect(() => {
    checkAuth();
  }, []);
  
  // Refetch students when course changes
  useEffect(() => {
    if (currentUser && selectedCourseId) {
      fetchStudents();
    }
  }, [selectedCourseId, currentUser]);
  
  useEffect(() => {
    const lastReminderDate = localStorage.getItem('lastCourseMaterialsReminder');
    const today = new Date().toDateString();
    if (lastReminderDate !== today) {
      setTimeout(() => {
        toast.info("💡 Tip: You can upload lecture slides and materials in the Materials tab!", {
          duration: 5000,
        });
        localStorage.setItem('lastCourseMaterialsReminder', today);
      }, 1500);
    }
    
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel('instructor-realtime-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'instructor_students',
            filter: `instructor_id=eq.${user.id}`
          },
          (payload) => {
            console.log('👥 New student joined:', payload);
            fetchStudents();
            toast.success('New student joined the class!', { duration: 3000 });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'student_assignments',
            filter: `instructor_id=eq.${user.id}`
          },
          (payload) => {
            console.log('📋 Assignment update:', payload);
            if (fetchDebounceTimer.current) {
              clearTimeout(fetchDebounceTimer.current);
            }
            fetchDebounceTimer.current = setTimeout(() => {
              fetchStudents();
            }, 500);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_stats'
          },
          (payload) => {
            console.log('📊 Student stats updated:', payload);
            if (fetchDebounceTimer.current) {
              clearTimeout(fetchDebounceTimer.current);
            }
            fetchDebounceTimer.current = setTimeout(() => {
              fetchStudents();
            }, 500);
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully subscribed to realtime updates');
          }
        });

      return channel;
    };

    const channelPromise = setupRealtime();

    return () => {
      channelPromise.then(channel => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/instructor/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "instructor")
      .maybeSingle();
    
    if (!roleData) {
      toast.error("Access denied. Instructor privileges required.");
      navigate("/instructor/auth");
      return;
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("instructor_code, course_title, course_schedule, course_topics, onboarded, professor_type, full_name")
      .eq("id", session.user.id)
      .single();
    
    setInstructorProfile(profile);

    if (!profile?.onboarded) {
      toast.info("Please complete your instructor onboarding");
      navigate("/instructor/onboarding");
      return;
    }

    if (!profile?.course_title || !profile.course_schedule || 
        !profile.course_topics || profile.course_topics.length === 0) {
      toast.warning("⚠️ Your course details are incomplete. Please update them in onboarding.", {
        duration: 5000,
      });
    }

    setCurrentUser(session.user);
    setInstructorCode(profile.instructor_code || "");
  };

  const fetchStudents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      if (!selectedCourseId) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data: studentLinks } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id)
        .eq("course_id", selectedCourseId)
        .limit(100);

      if (!studentLinks || studentLinks.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);

      const [profilesData, statsData, progressData, masteryData, gradesData] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", studentIds),
        supabase.from("user_stats").select("*").in("user_id", studentIds),
        supabase.from("lesson_progress").select("user_id, completed").in("user_id", studentIds),
        supabase.from("lesson_mastery").select("user_id, attempt_count, is_mastered").in("user_id", studentIds),
        supabase
          .from("student_assignments")
          .select("student_id, grade")
          .eq("assignment_type", "lecture_checkin")
          .eq("instructor_id", user.id)
          .eq("course_id", selectedCourseId)
          .in("student_id", studentIds),
      ]);

      const statsMap = new Map(statsData.data?.map(s => [s.user_id, s]));
      const progressMap = new Map<string, number>();
      const masteryMap = new Map<string, { total: number; sum: number }>();
      const gradesMap = new Map<string, number[]>();

      progressData.data?.forEach(p => {
        if (p.completed) {
          progressMap.set(p.user_id, (progressMap.get(p.user_id) || 0) + 1);
        }
      });

      masteryData.data?.forEach(m => {
        if (m.is_mastered) {
          const existing = masteryMap.get(m.user_id) || { total: 0, sum: 0 };
          masteryMap.set(m.user_id, {
            total: existing.total + 1,
            sum: existing.sum + m.attempt_count
          });
        }
      });

      gradesData.data?.forEach(g => {
        if (g.grade !== null) {
          const existing = gradesMap.get(g.student_id) || [];
          existing.push(Number(g.grade));
          gradesMap.set(g.student_id, existing);
        }
      });

      const profileRows = profilesData.data || [];
      const combinedStudents = profileRows.map((profile) => {
        const stats = statsMap.get(profile.id);
        const completedLessons = progressMap.get(profile.id) || 0;
        const mastery = masteryMap.get(profile.id);
        const avgMasteryAttempts = mastery ? mastery.sum / mastery.total : undefined;
        const grades = gradesMap.get(profile.id) || [];
        const average_grade =
          grades.length > 0 ? grades.reduce((sum, g) => sum + g, 0) / grades.length : undefined;

        return {
          id: profile.id,
          name: profile.full_name || "Student",
          current_streak: stats?.current_streak || 0,
          completedLessons,
          totalLessons: 10,
          averageMasteryAttempts: avgMasteryAttempts,
          average_grade,
        };
      });

      setStudents(combinedStudents);
    } catch (error) {
      logger.error("Error fetching students:", error);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    localStorage.removeItem("lastCourseMaterialsReminder");
    await supabase.auth.signOut();
    navigate("/instructor/auth");
  };

  const handleStudentClick = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setDialogOpen(true);
  };

  const rankedStudents = [...students]
    .sort((a, b) => (b.average_grade || 0) - (a.average_grade || 0))
    .map((s, idx) => ({ ...s, rank: idx + 1 }));

  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any>(null);

  useEffect(() => {
    if (selectedStudentId && dialogOpen) {
      fetchStudentDetail(selectedStudentId);
    }
  }, [selectedStudentId, dialogOpen]);

  const fetchStudentDetail = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    try {
      const { data: attempts } = await supabase
        .from("problem_attempts")
        .select(`
          *,
          stem_problems(problem_text)
        `)
        .eq("user_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: lessonActivity } = await supabase
        .from("lesson_progress")
        .select(`
          *,
          lessons(title)
        `)
        .eq("user_id", studentId)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: achievementActivity } = await supabase
        .from("user_achievements")
        .select(`
          *,
          achievements(name)
        `)
        .eq("user_id", studentId)
        .order("earned_at", { ascending: false })
        .limit(5);

      const recentActivity = [
        ...(lessonActivity?.map(l => ({
          type: "Lesson Completed",
          description: (l as any).lessons?.title || "Unknown lesson",
          date: l.created_at || new Date().toISOString(),
        })) || []),
        ...(achievementActivity?.map(a => ({
          type: "Achievement Unlocked",
          description: (a as any).achievements?.name || "Unknown achievement",
          date: a.earned_at,
        })) || []),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

      setSelectedStudentDetail({
        ...student,
        problemAttempts: attempts?.map(a => ({
          problem_text: (a as any).stem_problems?.problem_text || "Unknown problem",
          is_correct: a.is_correct,
          time_spent_seconds: a.time_spent_seconds || 0,
          created_at: a.created_at,
        })) || [],
        recentActivity,
      });
    } catch (error) {
      logger.error("Error fetching student details:", error);
      toast.error("Failed to load student details");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const quickActions = [
    {
      icon: <Radio className="w-3 h-3" />,
      label: "Start Live",
      onClick: () => setActiveTab("live"),
      variant: "primary" as const,
    },
    {
      icon: <Presentation className="w-3 h-3" />,
      label: "Present Slides",
      onClick: () => navigate("/instructor/slides"),
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Organization connection card removed - not needed unless for institutional licensing */}
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {instructorCode && (
                <Card className="headspace-card h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Your Class Code</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <code className="text-2xl font-bold text-primary bg-primary/5 px-4 py-3 rounded-xl text-center block break-all">
                      {instructorCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={() => {
                        navigator.clipboard.writeText(instructorCode);
                        toast.success("Code copied to clipboard!");
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Code
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Share this code with your students
                    </p>
                  </CardContent>
                </Card>
              )}

              {currentUser && (
                <div className="xl:col-span-2">
                  <InstructorOverview instructorId={currentUser.id} />
                </div>
              )}
            </div>
          </div>
        );

      case "live":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* LiveSessionControls is rendered outside switch to persist - shown here */}
              <Card className="headspace-card border-primary/20 bg-gradient-to-br from-primary/5 to-transparent h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Presentation className="h-5 w-5 text-primary" />
                    Slide Presenter
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Present slides with integrated live lecture tools
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => navigate('/instructor/slides')}
                    className="w-full rounded-xl"
                  >
                    Open Slide Presenter
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* LectureTranscription is now rendered outside tabs to persist recording */}
            
            <div className="min-w-0">
              <LectureCheckInResults />
            </div>
          </div>
        );

      case "recorded":
        return (
          <div className="space-y-6">
            <div className="min-w-0">
              <PreRecordedLectureUpload />
            </div>
            
            <div className="min-w-0">
              <LectureVideoManager />
            </div>
            
            <div className="min-w-0">
              <PreRecordedLectureGrades />
            </div>
          </div>
        );

      case "students":
        return (
          <div className="space-y-6">
            <div className="min-w-0">
              <StudentRankingCard
                students={rankedStudents}
                onStudentClick={handleStudentClick}
                onRefresh={fetchStudents}
              />
            </div>
            
            <div className="min-w-0">
              <AnswerReleaseCard instructorId={currentUser?.id || ""} />
            </div>
            
            {currentUser && (
              <div className="min-w-0">
                <AcademicIntegrityInsights instructorId={currentUser.id} />
              </div>
            )}
          </div>
        );

      case "materials":
        return (
          <div className="space-y-6">
            <div className="min-w-0">
              <LectureMaterialsUpload />
            </div>
            
            
            {professorType === "research" && (
              <Card className="headspace-card h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Code className="h-5 w-5 text-primary" />
                    Research Tools
                  </CardTitle>
                  <CardDescription>
                    AI-powered content generation for research
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full rounded-xl">
                    Access Lab Portal
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case "question-bank":
        return (
          <div className="space-y-6">
            <Card className="headspace-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Library className="h-5 w-5 text-primary" />
                  STEM Question Bank
                </CardTitle>
                <CardDescription>
                  Create and manage coding problems, MCQs, and short-answer questions for your classes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QuestionBankManager 
                  courseId={selectedCourseId || undefined}
                  professorType={professorType}
                  isLiveSession={!!activeSession}
                />
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardShell
      role="instructor"
      userName={instructorProfile?.full_name || currentUser?.email || "Instructor"}
      userEmail={currentUser?.email || ""}
      userId={currentUser?.id}
      onLogout={handleLogout}
      title="Instructor Dashboard"
      subtitle={instructorProfile?.course_title}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabValue)}
      headerActions={
        <>
          <CourseSelector />
          <QuickActions actions={quickActions} className="hidden lg:flex" />
        </>
      }
    >
      <div className="flex min-h-[calc(100vh-12rem)]">
        {/* Sidebar Navigation - Desktop Only */}
        <aside className="hidden lg:flex w-56 flex-col border-r border-border/50 pr-6 mr-6 shrink-0">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Always mount LiveSessionControls to persist session state across tabs */}
          {currentUser && (
            <div className={cn("min-w-0 mb-6", activeTab !== "live" && "hidden")}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <LiveSessionControls 
                  onSessionChange={setLiveSessionId} 
                  activeSession={activeSession}
                  setActiveSession={setActiveSession}
                />
              </div>
            </div>
          )}
          
          {/* Always mount LectureTranscription to persist recording across tabs */}
          <div className={cn("min-w-0 mb-6", activeTab !== "live" && "hidden")}>
            <LectureTranscription onQuestionGenerated={() => {}} />
          </div>
          
          {renderTabContent()}
        </main>
      </div>

      {/* Student Detail Dialog */}
      {selectedStudentDetail && (
        <StudentDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          student={selectedStudentDetail}
        />
      )}
    </DashboardShell>
  );
}
