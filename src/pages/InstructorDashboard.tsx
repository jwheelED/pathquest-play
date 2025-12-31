import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, BookOpen, Presentation, Video, Radio, Copy } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { InstructorOverview } from "@/components/instructor/InstructorOverview";
import StudentRankingCard from "@/components/instructor/StudentRankingCard";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";
import { AcademicIntegrityInsights } from "@/components/instructor/AcademicIntegrityInsights";
import { LectureTranscription } from "@/components/instructor/LectureTranscription";
import { LectureCheckInResults } from "@/components/instructor/LectureCheckInResults";
import { AnswerReleaseCard } from "@/components/instructor/AnswerReleaseCard";
import { LectureMaterialsUpload } from "@/components/instructor/LectureMaterialsUpload";
import { InstructorConnectionCard } from "@/components/instructor/InstructorConnectionCard";
import { LiveSessionControls } from "@/components/instructor/LiveSessionControls";
import { PreRecordedLectureUpload } from "@/components/instructor/PreRecordedLectureUpload";
import { LectureVideoManager } from "@/components/instructor/LectureVideoManager";
import { PreRecordedLectureGrades } from "@/components/instructor/PreRecordedLectureGrades";

interface Student {
  id: string;
  name: string;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
  averageMasteryAttempts?: number;
  average_grade?: number;
}

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
  const fetchDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  
  const professorType = instructorProfile?.professor_type;

  useEffect(() => {
    checkAuth();
    fetchStudents();
    
    const lastReminderDate = localStorage.getItem('lastCourseMaterialsReminder');
    const today = new Date().toDateString();
    if (lastReminderDate !== today) {
      setTimeout(() => {
        toast.info("💡 Tip: You can upload lecture slides and materials in the Course Materials card below!", {
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

      const { data: studentLinks } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id)
        .limit(100);

      if (!studentLinks || studentLinks.length === 0) {
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
      onClick: () => {},
      variant: "primary" as const,
    },
    {
      icon: <Presentation className="w-3 h-3" />,
      label: "Present Slides",
      onClick: () => navigate("/instructor/slides"),
    },
    {
      icon: <Video className="w-3 h-3" />,
      label: "Record",
      onClick: () => navigate("/instructor/presenter"),
    },
  ];

  return (
    <DashboardShell
      role="instructor"
      userName={instructorProfile?.full_name || currentUser?.email || "Instructor"}
      userEmail={currentUser?.email || ""}
      userId={currentUser?.id}
      onLogout={handleLogout}
      title="Instructor Dashboard"
      subtitle={instructorProfile?.course_title}
      headerActions={
        <QuickActions actions={quickActions} className="hidden lg:flex" />
      }
    >
      <div className="space-y-6">
        {/* Organization and Admin Connection Info */}
        <InstructorConnectionCard />

        {/* Top Section - Overview and Code */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Class Health Overview */}
          {currentUser && (
            <div className="lg:col-span-2">
              <InstructorOverview instructorId={currentUser.id} />
            </div>
          )}

          {/* Instructor Code Card */}
          {instructorCode && (
            <div className="headspace-card rounded-2xl p-6 border border-border/50">
              <h3 className="text-lg font-semibold mb-3 text-foreground">Your Class Code</h3>
              <div className="flex flex-col gap-3">
                <code className="text-3xl font-bold text-primary bg-primary/5 px-4 py-3 rounded-xl text-center">
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
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Share this code with your students to join your class
              </p>
            </div>
          )}
        </div>

        {/* Live Session & Presentation Tools */}
        {currentUser && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LiveSessionControls onSessionChange={setLiveSessionId} />

            {/* Slide Presenter Quick Access */}
            <Card className="headspace-card border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Presentation className="h-5 w-5 text-primary" />
                  Slide Presenter
                </CardTitle>
                <CardDescription>
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
        )}

        {/* Content Management */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LectureMaterialsUpload />
          
          {professorType === "research" && (
            <Card className="headspace-card">
              <CardHeader>
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

        {/* Pre-recorded Lectures */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PreRecordedLectureUpload />
          <LectureVideoManager />
        </div>

        {/* Grades and Check-ins */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PreRecordedLectureGrades />
          <LectureCheckInResults />
        </div>

        {/* Live Lecture Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LectureTranscription onQuestionGenerated={() => {}} />
          <AnswerReleaseCard instructorId={currentUser?.id || ""} />
        </div>

        {/* Academic Integrity */}
        {currentUser && <AcademicIntegrityInsights instructorId={currentUser.id} />}

        {/* Student Rankings */}
        <StudentRankingCard
          students={rankedStudents}
          onStudentClick={handleStudentClick}
          onRefresh={fetchStudents}
        />

        {/* Student Detail Dialog */}
        {selectedStudentDetail && (
          <StudentDetailDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            student={selectedStudentDetail}
          />
        )}
      </div>
    </DashboardShell>
  );
}
