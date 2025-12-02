import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Assignment {
  id: string;
  student_id: string;
  title: string;
  content: any;
  quiz_responses: any;
  grade: number | null;
  completed: boolean;
  created_at: string;
  response_time_seconds?: number | null;
}

interface LectureQuestion {
  timestamp: string;
  questions: any[];
  assignments: Assignment[];
}

interface QuestionStats {
  responseCount: number;
  totalStudents: number;
  correctCount: number;
  correctPercentage: number | null;
  avgResponseTime: number | null;
}

export const useLecturePresenterData = () => {
  const [studentCount, setStudentCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<LectureQuestion | null>(null);
  const [recentQuestions, setRecentQuestions] = useState<LectureQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lectureStartTime, setLectureStartTime] = useState<Date | null>(null);

  const calculateQuestionStats = useCallback((assignments: Assignment[], questionIndex: number, question: any): QuestionStats => {
    // Filter assignments to only those containing this specific question
    const questionAssignments = assignments.filter((a) => {
      const content = a.content as any;
      const assignmentQuestions = content?.questions || [];
      return assignmentQuestions.some((q: any) => q.question === question.question);
    });

    // Deduplicate by student - keep latest submission
    const uniqueStudents = new Map<string, Assignment>();
    questionAssignments.forEach((assignment) => {
      const existing = uniqueStudents.get(assignment.student_id);
      if (!existing || new Date(assignment.created_at) > new Date(existing.created_at)) {
        uniqueStudents.set(assignment.student_id, assignment);
      }
    });

    const uniqueAssignments = Array.from(uniqueStudents.values());
    const completed = uniqueAssignments.filter((a) => a.completed);

    // For manual grade short answer questions, don't calculate correct stats
    const isManualGradeShortAnswer = question.type === 'short_answer' && 
      (!question.expectedAnswer || question.expectedAnswer === '' || question.gradingMode === 'manual_grade');

    const correctAnswer = question.overriddenAnswer || question.correctAnswer;
    const correct = isManualGradeShortAnswer ? [] : completed.filter((a) => {
      const response = a.quiz_responses?.[questionIndex.toString()] || a.quiz_responses?.[questionIndex];
      return response === correctAnswer;
    });

    // Calculate average response time
    const responseTimes = completed
      .map(a => a.response_time_seconds)
      .filter((time): time is number => time !== null && time !== undefined);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : null;

    return {
      responseCount: completed.length,
      totalStudents: uniqueAssignments.length,
      correctCount: correct.length,
      correctPercentage: isManualGradeShortAnswer ? null : (completed.length > 0 ? (correct.length / completed.length) * 100 : 0),
      avgResponseTime,
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // Fetch student count
      const { data: students } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', user.id);

      setStudentCount(students?.length || 0);

      // Fetch recent lecture check-in assignments (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: assignments, error: fetchError } = await supabase
        .from('student_assignments')
        .select('id, student_id, title, content, quiz_responses, grade, completed, created_at, response_time_seconds')
        .eq('instructor_id', user.id)
        .eq('assignment_type', 'lecture_checkin')
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      // Group assignments by timestamp (within 5 minutes)
      const groups: LectureQuestion[] = [];

      assignments?.forEach((assignment) => {
        const timestamp = new Date(assignment.created_at).getTime();
        const content = assignment.content as any;
        const assignmentQuestions = content?.questions || [];

        // Find existing group within 5 minutes
        const existingGroupIndex = groups.findIndex((g) => {
          const groupTime = new Date(g.timestamp).getTime();
          return Math.abs(timestamp - groupTime) < 5 * 60 * 1000;
        });

        if (existingGroupIndex !== -1) {
          const existingGroup = groups[existingGroupIndex];
          const newAssignments = [...existingGroup.assignments, assignment];
          
          // Merge questions
          const newQuestions = [...existingGroup.questions];
          assignmentQuestions.forEach((newQuestion: any) => {
            const alreadyExists = newQuestions.some(
              (q: any) => q.question === newQuestion.question
            );
            
            if (!alreadyExists) {
              newQuestions.push(newQuestion);
            }
          });
          
          groups[existingGroupIndex] = {
            ...existingGroup,
            assignments: newAssignments,
            questions: newQuestions,
          };
        } else {
          groups.push({
            timestamp: assignment.created_at,
            assignments: [assignment],
            questions: [...assignmentQuestions],
          });
        }
      });

      // Set current question (most recent) and recent questions (rest)
      if (groups.length > 0) {
        setCurrentQuestion(groups[0]);
        setRecentQuestions(groups.slice(1, 6)); // Show up to 5 recent questions
        
        // Set lecture start time from oldest question
        if (!lectureStartTime) {
          const oldestGroup = groups[groups.length - 1];
          setLectureStartTime(new Date(oldestGroup.timestamp));
        }
      } else {
        setCurrentQuestion(null);
        setRecentQuestions([]);
      }

      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching lecture presenter data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [lectureStartTime]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscriptions
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    let channel: any;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('lecture-presenter-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'student_assignments',
            filter: `instructor_id=eq.${user.id}`,
          },
          (payload) => {
            const record = (payload.new || payload.old) as any;
            if (!record || record.assignment_type !== 'lecture_checkin') return;
            
            console.log('📊 Presenter view update:', payload.eventType);
            
            // Debounce updates
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              fetchData();
            }, 300);
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      clearTimeout(debounceTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchData]);

  // Polling fallback every 3 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    studentCount,
    currentQuestion,
    recentQuestions,
    calculateQuestionStats,
    loading,
    error,
    lectureStartTime,
  };
};
