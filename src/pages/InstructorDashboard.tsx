import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { StudentProgressCard } from "@/components/instructor/StudentProgressCard";
import StrugglingStudentsCard from "@/components/instructor/StrugglingStudentsCard";
import StudentRankingCard from "@/components/instructor/StudentRankingCard";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";
// LEGACY: Content Generator replaced by Lecture Transcription
// import { ContentGenerator } from "@/components/instructor/ContentGenerator";
// import { ReviewQueue } from "@/components/instructor/ReviewQueue";
import { LectureTranscription } from "@/components/instructor/LectureTranscription";
import { LectureQuestionReview } from "@/components/instructor/LectureQuestionReview";
import { AssignContent } from "@/components/instructor/AssignContent";
import { AssignedContentManager } from "@/components/instructor/AssignedContentManager";
import StudentChatCard from "@/components/instructor/StudentChatCard";

interface Student {
  id: string;
  name: string;
  level: number;
  experience_points: number;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
  averageMasteryAttempts?: number;
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

  useEffect(() => {
    checkAuth();
    fetchStudents();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/instructor/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, instructor_code")
      .eq("id", session.user.id)
      .single();

    if (profile?.role !== "instructor") {
      toast.error("Access denied");
      navigate("/instructor/auth");
      return;
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
        .eq("instructor_id", user.id);

      if (!studentLinks || studentLinks.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);

      const { data: studentsData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", studentIds);

      const { data: statsData } = await supabase
        .from("user_stats")
        .select("*")
        .in("user_id", studentIds);

      const { data: progressData } = await supabase
        .from("lesson_progress")
        .select("user_id, completed")
        .in("user_id", studentIds);

      const { data: masteryData } = await supabase
        .from("lesson_mastery")
        .select("user_id, attempt_count, is_mastered")
        .in("user_id", studentIds);

      const combinedStudents = studentsData?.map(student => {
        const stats = statsData?.find(s => s.user_id === student.id);
        const progress = progressData?.filter(p => p.user_id === student.id) || [];
        const completedLessons = progress.filter(p => p.completed).length;
        
        const studentMastery = masteryData?.filter(m => m.user_id === student.id && m.is_mastered) || [];
        const avgMasteryAttempts = studentMastery.length > 0
          ? studentMastery.reduce((sum, m) => sum + m.attempt_count, 0) / studentMastery.length
          : undefined;

        return {
          id: student.id,
          name: student.name || "Unknown",
          level: stats?.level || 1,
          experience_points: stats?.experience_points || 0,
          current_streak: stats?.current_streak || 0,
          completedLessons,
          totalLessons: 10,
          averageMasteryAttempts: avgMasteryAttempts,
        };
      }) || [];

      setStudents(combinedStudents);
    } catch (error) {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/instructor/auth");
  };

  const handleStudentClick = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setDialogOpen(true);
  };

  const strugglingStudents = students
    .filter(s => s.current_streak < 2 || (s.completedLessons / s.totalLessons) < 0.3)
    .map(s => ({
      id: s.id,
      name: s.name,
      issue: s.current_streak < 2 
        ? "Low activity streak" 
        : "Behind on lessons",
      severity: (s.completedLessons / s.totalLessons) < 0.2 ? "high" as const : "medium" as const,
      lastActive: "2 days ago",
    }));

  const rankedStudents = [...students]
    .sort((a, b) => b.experience_points - a.experience_points)
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LectureTranscription onQuestionGenerated={() => setRefreshQueue(prev => prev + 1)} />
              <AssignContent />
            </div>
            
            <LectureQuestionReview refreshTrigger={refreshQueue} />

            <AssignedContentManager />

            <div className="grid lg:grid-cols-2 gap-6">
              <StudentProgressCard instructorId={currentUser.id} />
              <StrugglingStudentsCard 
                students={strugglingStudents}
                onMessageStudent={() => {}}
              />
            </div>

            <StudentRankingCard 
              students={rankedStudents}
              onStudentClick={handleStudentClick}
            />

            <StudentChatCard 
              students={students.map(s => ({ id: s.id, name: s.name }))}
              currentUserId={currentUser.id}
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