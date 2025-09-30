import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import StudentProgressCard from "@/components/instructor/StudentProgressCard";
import StrugglingStudentsCard from "@/components/instructor/StrugglingStudentsCard";
import StudentRankingCard from "@/components/instructor/StudentRankingCard";
import StudentChatCard from "@/components/instructor/StudentChatCard";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";

interface Student {
  id: string;
  name: string;
  level: number;
  experience_points: number;
  current_streak: number;
  completedLessons: number;
  totalLessons: number;
}

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile?.role !== "instructor") {
      toast.error("Access denied");
      navigate("/instructor/auth");
      return;
    }

    setCurrentUser(session.user);
  };

  const fetchStudents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get students linked to this instructor
      const { data: studentLinks } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", user.id);

      if (!studentLinks || studentLinks.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);

      // Fetch student data
      const { data: studentsData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", studentIds);

      // Fetch student stats
      const { data: statsData } = await supabase
        .from("user_stats")
        .select("*")
        .in("user_id", studentIds);

      // Fetch lesson progress
      const { data: progressData } = await supabase
        .from("lesson_progress")
        .select("user_id, completed")
        .in("user_id", studentIds);

      // Combine data
      const combinedStudents = studentsData?.map(student => {
        const stats = statsData?.find(s => s.user_id === student.id);
        const progress = progressData?.filter(p => p.user_id === student.id) || [];
        const completedLessons = progress.filter(p => p.completed).length;

        return {
          id: student.id,
          name: student.name || "Unknown",
          level: stats?.level || 1,
          experience_points: stats?.experience_points || 0,
          current_streak: stats?.current_streak || 0,
          completedLessons,
          totalLessons: 10, // This could be dynamic
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

  const handleMessageStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    // Scroll to chat card or open in a dialog
  };

  const handleStudentClick = async (studentId: string) => {
    // Fetch detailed student data
    const student = students.find(s => s.id === studentId);
    if (student) {
      setSelectedStudentId(studentId);
      setDialogOpen(true);
    }
  };

  // Calculate struggling students (low streak, low progress)
  const strugglingStudents = students
    .filter(s => s.current_streak < 2 || (s.completedLessons / s.totalLessons) < 0.3)
    .map(s => ({
      id: s.id,
      name: s.name,
      issue: s.current_streak < 2 
        ? "Low activity streak" 
        : "Behind on lessons",
      severity: (s.completedLessons / s.totalLessons) < 0.2 ? "high" as const : "medium" as const,
      lastActive: "2 days ago", // This could be calculated from last_activity_date
    }));

  // Rank students by XP
  const rankedStudents = [...students]
    .sort((a, b) => b.experience_points - a.experience_points)
    .map((s, idx) => ({ ...s, rank: idx + 1 }));

  const selectedStudent = selectedStudentId ? students.find(s => s.id === selectedStudentId) : null;
  const selectedStudentDetail = selectedStudent ? {
    ...selectedStudent,
    problemAttempts: [], // Fetch from problem_attempts table
    recentActivity: [], // Fetch from various tables
  } : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/10">
      {/* Header */}
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

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {students.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Students Yet</h2>
            <p className="text-muted-foreground">
              Students will appear here once they're assigned to you.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Row: Progress and Struggling Students */}
            <div className="grid lg:grid-cols-2 gap-6">
              <StudentProgressCard students={students} />
              <StrugglingStudentsCard 
                students={strugglingStudents}
                onMessageStudent={handleMessageStudent}
              />
            </div>

            {/* Middle Row: Rankings and Chat */}
            <div className="grid lg:grid-cols-2 gap-6">
              <StudentRankingCard 
                students={rankedStudents}
                onStudentClick={handleStudentClick}
              />
              <StudentChatCard 
                students={students}
                currentUserId={currentUser?.id || ""}
              />
            </div>
          </div>
        )}
      </main>

      {/* Student Detail Dialog */}
      <StudentDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={selectedStudentDetail}
      />
    </div>
  );
}
