import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Users, Code, BookOpen } from "lucide-react";
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
import { QuestionFormatSettings } from "@/components/instructor/QuestionFormatSettings";
import { QuestionLimitSettings } from "@/components/instructor/QuestionLimitSettings";
import { AnswerReleaseCard } from "@/components/instructor/AnswerReleaseCard";
import { AutoQuestionSettings } from "@/components/instructor/AutoQuestionSettings";
import { AutoGradeSettings } from "@/components/instructor/AutoGradeSettings";
import AutoGradeModelSettings from "@/components/instructor/AutoGradeModelSettings";
import { QuestionReliabilityDashboard } from "@/components/instructor/QuestionReliabilityDashboard";

import { LectureMaterialsUpload } from "@/components/instructor/LectureMaterialsUpload";

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
      const [usersData, statsData, progressData, masteryData, gradesData] = await Promise.all([
        supabase.from("users").select("id, name").in("id", studentIds),
        supabase.from("user_stats").select("*").in("user_id", studentIds),
        supabase.from("lesson_progress").select("user_id, completed").in("user_id", studentIds),
        supabase.from("lesson_mastery").select("user_id, attempt_count, is_mastered").in("user_id", studentIds),
        supabase.from("student_assignments").select("student_id, grade").eq("assignment_type", "lecture_checkin").eq("instructor_id", user.id).in("student_id", studentIds)
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

      const combinedStudents = usersData.data?.map(student => {
        const stats = statsMap.get(student.id);
        const completedLessons = progressMap.get(student.id) || 0;
        const mastery = masteryMap.get(student.id);
        const avgMasteryAttempts = mastery ? mastery.sum / mastery.total : undefined;
        const grades = gradesMap.get(student.id) || [];
        const average_grade = grades.length > 0 
          ? grades.reduce((sum, g) => sum + g, 0) / grades.length 
          : undefined;

        return {
          id: student.id,
          name: student.name || "Unknown",
          current_streak: stats?.current_streak || 0,
          completedLessons,
          totalLessons: 10,
          averageMasteryAttempts: avgMasteryAttempts,
          average_grade,
        };
      }) || [];

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
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-primary">Instructor Dashboard</h1>
              <p className="text-sm text-muted-foreground">Manage and track your students</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" className="gap-2">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {instructorCode && (
          <div className="mb-6 p-6 bg-card border rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Your Instructor Code</h3>
            <div className="flex items-center gap-4">
              <code className="text-2xl font-bold text-primary bg-muted px-4 py-2 rounded">
                {instructorCode}
              </code>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(instructorCode);
                  toast.success("Code copied to clipboard!");
                }}
              >
                Copy Code
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Share this code with your students so they can join your class.
            </p>
          </div>
        )}

        {/* Settings visible regardless of student count */}
        {currentUser && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <QuestionFormatSettings instructorId={currentUser.id} />
              <AutoGradeSettings />
              <AutoGradeModelSettings />
            
            {professorType === "stem" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    STEM Features
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>Enhanced coding question generation and test case auto-grading enabled.</p>
                </CardContent>
              </Card>
            )}
            
            {professorType === "humanities" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Humanities Features
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>Essay analysis, discussion prompts, and enhanced short-answer grading enabled.</p>
                </CardContent>
              </Card>
            )}
              <QuestionLimitSettings />
            </div>
            
            {/* System Reliability Dashboard */}
            <QuestionReliabilityDashboard />
            
            <AutoQuestionSettings />
            
            <LectureTranscription onQuestionGenerated={() => setRefreshQueue(prev => prev + 1)} />
          </div>
        )}

        {students.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Students Yet</h2>
            <p className="text-muted-foreground">
              Students will appear here once they join with your code.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <LectureCheckInResults />

            <AnswerReleaseCard instructorId={currentUser.id} />

            <LectureMaterialsUpload />

            {currentUser && (
              <>
                <AcademicIntegrityInsights instructorId={currentUser.id} />
              </>
            )}
          </div>
        )}

        {/* Always show Student Rankings with empty state support */}
        {currentUser && (
          <div className="mt-6">
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