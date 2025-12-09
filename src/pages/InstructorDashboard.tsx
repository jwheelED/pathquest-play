import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Users, Code, BookOpen, Presentation, Settings } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import StudentRankingCard from "@/components/instructor/StudentRankingCard";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";
import { AcademicIntegrityInsights } from "@/components/instructor/AcademicIntegrityInsights";
// LEGACY: Content Generator replaced by Lecture Transcription
// import { ContentGenerator } from "@/components/instructor/ContentGenerator";
// import { ReviewQueue } from "@/components/instructor/ReviewQueue";
import { LectureTranscription } from "@/components/instructor/LectureTranscription";
import { LectureCheckInResults } from "@/components/instructor/LectureCheckInResults";
import { AnswerReleaseCard } from "@/components/instructor/AnswerReleaseCard";

import { LectureMaterialsUpload } from "@/components/instructor/LectureMaterialsUpload";
import { InstructorConnectionCard } from "@/components/instructor/InstructorConnectionCard";
import { LiveSessionControls } from "@/components/instructor/LiveSessionControls";

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
    
    // Show reminder about course materials once per day
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
    
    // Set up real-time updates after getting user
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Real-time updates for classroom stats and student progress
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
            fetchStudents(); // Refresh student list immediately
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
            
            // Debounce to handle multiple rapid updates
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
            
            // Debounce to handle multiple rapid updates
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

    // Verify instructor role using user_roles table
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
    
    // Fetch profile details
    const { data: profile } = await supabase
      .from("profiles")
      .select("instructor_code, course_title, course_schedule, course_topics, onboarded, professor_type")
      .eq("id", session.user.id)
      .single();
    
    setInstructorProfile(profile);

    // Only require re-onboarding if NEVER onboarded before
    // Don't force if just one field is missing
    if (!profile?.onboarded) {
      toast.info("Please complete your instructor onboarding");
      navigate("/instructor/onboarding");
      return;
    }

    // Warn about missing fields but don't block access
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

      // Optimized: Single query with limit for large classes
      const { data: studentLinks } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id)
        .limit(100); // Reasonable limit for classroom size

      if (!studentLinks || studentLinks.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);

      // Parallel queries for better performance with 40+ students
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

      // Create lookup maps for O(1) access - much faster with 40+ students
      const statsMap = new Map(statsData.data?.map(s => [s.user_id, s]));
      const progressMap = new Map<string, number>();
      const masteryMap = new Map<string, { total: number; sum: number }>();
      const gradesMap = new Map<string, number[]>();

      // Aggregate progress efficiently
      progressData.data?.forEach(p => {
        if (p.completed) {
          progressMap.set(p.user_id, (progressMap.get(p.user_id) || 0) + 1);
        }
      });

      // Aggregate mastery efficiently  
      masteryData.data?.forEach(m => {
        if (m.is_mastered) {
          const existing = masteryMap.get(m.user_id) || { total: 0, sum: 0 };
          masteryMap.set(m.user_id, {
            total: existing.total + 1,
            sum: existing.sum + m.attempt_count
          });
        }
      });

      // Aggregate grades efficiently
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
    // Clear ALL cached data
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/10">
      {/* Mobile-optimized header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-primary truncate">Instructor Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Manage and track your students</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={() => navigate("/instructor/settings")} variant="ghost" size="sm" className="gap-1 sm:gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button onClick={handleLogout} variant="outline" size="sm" className="gap-1 sm:gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Organization and Admin Connection Info */}
        <InstructorConnectionCard />

        {/* Instructor Code - Mobile optimized */}
        {instructorCode && (
          <div className="p-4 sm:p-6 bg-card border rounded-lg shadow-sm">
            <h3 className="text-base sm:text-lg font-semibold mb-2">Your Instructor Code</h3>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <code className="text-xl sm:text-2xl font-bold text-primary bg-muted px-3 sm:px-4 py-2 rounded text-center sm:text-left">
                {instructorCode}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  navigator.clipboard.writeText(instructorCode);
                  toast.success("Code copied to clipboard!");
                }}
              >
                Copy Code
              </Button>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Share this code with your students so they can join your class.
            </p>
          </div>
        )}

        {/* Settings visible regardless of student count */}
        {currentUser && (
          <div className="space-y-4 sm:space-y-6">
            {/* Course type indicators */}
            <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
              {professorType === "stem" && (
                <Card>
                  <CardHeader className="pb-2 sm:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                      STEM Features
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs sm:text-sm text-muted-foreground pt-0">
                    <p>Enhanced coding question generation and test case auto-grading enabled.</p>
                  </CardContent>
                </Card>
              )}
            
            </div>
            <LiveSessionControls onSessionChange={setLiveSessionId} />

            {/* Slide Presenter Quick Access - Compact on mobile */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Presentation className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  Slide Presenter
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Present slides with integrated live lecture tools
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button 
                  onClick={() => navigate('/instructor/slides')}
                  className="w-full"
                  size="sm"
                >
                  <Presentation className="h-4 w-4 mr-2" />
                  Open Slide Presenter
                </Button>
              </CardContent>
            </Card>
            
            <LectureMaterialsUpload />
            
            <LectureTranscription onQuestionGenerated={() => setRefreshQueue(prev => prev + 1)} />
          </div>
        )}

        {students.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Users className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold mb-2">No Students Yet</h2>
            <p className="text-sm sm:text-base text-muted-foreground px-4">
              Students will appear here once they join with your code.
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <LectureCheckInResults />

            <AnswerReleaseCard instructorId={currentUser.id} />

            {currentUser && (
              <AcademicIntegrityInsights instructorId={currentUser.id} />
            )}
          </div>
        )}

        {/* Always show Student Rankings with empty state support */}
        {currentUser && (
          <div className="mt-4 sm:mt-6">
            <StudentRankingCard 
              students={rankedStudents}
              onStudentClick={handleStudentClick}
              onRefresh={fetchStudents}
            />
          </div>
        )}
      </main>

      <StudentDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={selectedStudentDetail}
      />
    </div>
  );
}