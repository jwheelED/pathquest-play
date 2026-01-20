import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { User, Trophy, Target, GraduationCap } from "lucide-react";
import StudentDetailDialog from "./StudentDetailDialog";
import { Badge } from "@/components/ui/badge";

interface StudentStats {
  id: string;
  name: string;
  experience_points: number;
  level: number;
  lessons_completed: number;
  avg_quiz_grade?: number;
}

export const StudentProgressCard = ({ instructorId }: { instructorId: string }) => {
  const [students, setStudents] = useState<(StudentStats & { id: string })[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  useEffect(() => {
    fetchStudents();

    // Real-time updates for student progress
    const channel = supabase
      .channel(`instructor-students-${instructorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instructor_students',
          filter: `instructor_id=eq.${instructorId}`
        },
        (payload) => {
          console.log('👥 New student in progress card:', payload);
          fetchStudents();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments',
          filter: `instructor_id=eq.${instructorId}`
        },
        (payload) => {
          console.log('📚 Student assignment updated:', payload);
          // Refetch when students complete assignments
          fetchStudents();
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
          console.log('📈 Student stats updated:', payload);
          // Refetch to show updated stats
          fetchStudents();
        }
      )
      .subscribe((status) => {
        console.log('Student progress realtime status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Student progress subscribed to realtime');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instructorId]);

  const fetchStudents = async () => {
    try {
      const { data: studentsData, error } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', instructorId);

      if (error) throw error;

      const statsData = await Promise.all(
        studentsData.map(async (relation) => {
          const { data: stats } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', relation.student_id)
            .single();

          const { data: progress } = await supabase
            .from('lesson_progress')
            .select('*')
            .eq('user_id', relation.student_id);

          const { data: user } = await supabase
            .from('users')
            .select('name')
            .eq('id', relation.student_id)
            .single();

          const { data: assignments } = await supabase
            .from('student_assignments')
            .select('grade')
            .eq('student_id', relation.student_id)
            .eq('assignment_type', 'quiz')
            .not('grade', 'is', null);

          const avgGrade = assignments && assignments.length > 0
            ? assignments.reduce((sum, a) => sum + (a.grade || 0), 0) / assignments.length
            : undefined;

          return {
            id: relation.student_id,
            name: user?.name || 'Unknown',
            experience_points: stats?.experience_points || 0,
            level: stats?.level || 1,
            lessons_completed: progress?.length || 0,
            avg_quiz_grade: avgGrade
          };
        })
      );

      setStudents(statsData);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const handleStudentClick = async (studentId: string) => {
    try {
      const { data: stats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', studentId)
        .single();

      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', studentId);

      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('id', studentId)
        .single();

      const { data: attempts } = await supabase
        .from('problem_attempts')
        .select('*, stem_problems(problem_text)')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false })
        .limit(10);

      setSelectedStudent({
        id: studentId,
        name: user?.name || 'Unknown',
        level: stats?.level || 1,
        experience_points: stats?.experience_points || 0,
        current_streak: stats?.current_streak || 0,
        completedLessons: progress?.length || 0,
        totalLessons: 100,
        problemAttempts: attempts?.map(a => ({
          problem_text: (a.stem_problems as any)?.problem_text || '',
          is_correct: a.is_correct,
          time_spent_seconds: a.time_spent_seconds || 0,
          created_at: a.created_at
        })) || [],
        recentActivity: []
      });
    } catch (error) {
      console.error('Error fetching student details:', error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Student Progress
          </CardTitle>
          <CardDescription>Monitor student advancement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {students.map((student) => (
            <div
              key={student.id}
              onClick={() => handleStudentClick(student.id)}
              className="p-4 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{student.name}</h3>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Level {student.level}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>{student.lessons_completed} lessons completed</span>
              </div>
              {student.avg_quiz_grade !== undefined && (
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">
                    Avg Quiz: {student.avg_quiz_grade.toFixed(0)}%
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {selectedStudent && (
        <StudentDetailDialog
          student={selectedStudent}
          open={!!selectedStudent}
          onOpenChange={(open) => !open && setSelectedStudent(null)}
        />
      )}
    </>
  );
};
