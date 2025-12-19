import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PathItemType = 'prime' | 'core' | 'review';
export type PathItemActionType = 'navigate' | 'practice' | 'upload' | 'challenge';

export interface PathItem {
  id: string;
  type: PathItemType;
  actionType: PathItemActionType;
  title: string;
  description: string;
  timeEstimate?: string;
  dueDate?: string;
  sourceContext?: string;
  priority: number;
  action: () => void;
  data?: any;
}

interface LearningPathData {
  items: PathItem[];
  nextItem: PathItem | null;
  loading: boolean;
  hasContent: boolean;
}

export function useLearningPath(
  userId: string, 
  classId?: string,
  onNavigate?: (path: string, state?: any) => void,
  onPractice?: (question: any) => void,
  onUpload?: () => void
): LearningPathData {
  const [data, setData] = useState<LearningPathData>({
    items: [],
    nextItem: null,
    loading: true,
    hasContent: false,
  });

  const fetchLearningPath = useCallback(async () => {
    if (!userId) return;

    try {
      const items: PathItem[] = [];
      let hasAnyContent = false;

      // 1. Fetch incomplete instructor assignments (CORE - highest priority)
      const { data: assignments } = await supabase
        .from('student_assignments')
        .select('*')
        .eq('student_id', userId)
        .eq('completed', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (assignments && assignments.length > 0) {
        hasAnyContent = true;
        assignments.forEach((assignment, idx) => {
          items.push({
            id: `assignment-${assignment.id}`,
            type: 'core',
            actionType: 'navigate',
            title: assignment.title || 'Assignment',
            description: `Complete this ${assignment.assignment_type} assignment`,
            timeEstimate: '10-15 min',
            priority: 100 - idx * 5,
            action: () => onNavigate?.('/dashboard', { openAssignment: assignment.id }),
            data: assignment,
          });
        });
      }

      // 2. Fetch unpracticed personalized questions (CORE)
      const { data: unpracticedQuestions } = await supabase
        .from('personalized_questions')
        .select('*, student_study_materials(title)')
        .eq('user_id', userId)
        .eq('times_attempted', 0)
        .order('created_at', { ascending: false })
        .limit(5);

      if (unpracticedQuestions && unpracticedQuestions.length > 0) {
        hasAnyContent = true;
        // Group questions by material
        const questionsByMaterial = unpracticedQuestions.reduce((acc: any, q) => {
          const materialTitle = (q.student_study_materials as any)?.title || 'General';
          if (!acc[materialTitle]) {
            acc[materialTitle] = [];
          }
          acc[materialTitle].push(q);
          return acc;
        }, {});

        Object.entries(questionsByMaterial).forEach(([materialTitle, questions]: [string, any], idx) => {
          const firstQuestion = questions[0];
          items.push({
            id: `practice-${firstQuestion.id}`,
            type: 'core',
            actionType: 'practice',
            title: `Practice: ${materialTitle}`,
            description: `${questions.length} question${questions.length > 1 ? 's' : ''} waiting`,
            timeEstimate: `${questions.length * 2} min`,
            sourceContext: materialTitle !== 'General' ? `From: ${materialTitle}` : undefined,
            priority: 95 - idx * 5,
            action: () => onPractice?.(firstQuestion),
            data: { questions, firstQuestion },
          });
        });
      }

      // 3. Fetch questions that need review (REVIEW - got wrong before)
      const { data: reviewQuestions } = await supabase
        .from('personalized_questions')
        .select('*, student_study_materials(title)')
        .eq('user_id', userId)
        .gt('times_attempted', 0)
        .filter('times_correct', 'lt', 'times_attempted')
        .order('updated_at', { ascending: true })
        .limit(3);

      if (reviewQuestions && reviewQuestions.length > 0) {
        hasAnyContent = true;
        reviewQuestions.forEach((q, idx) => {
          const materialTitle = (q.student_study_materials as any)?.title;
          items.push({
            id: `review-${q.id}`,
            type: 'review',
            actionType: 'practice',
            title: `Review: ${q.topic_tags?.[0] || 'Concept'}`,
            description: q.question_text.slice(0, 60) + '...',
            sourceContext: materialTitle ? `From: ${materialTitle}` : undefined,
            priority: 90 - idx * 5,
            action: () => onPractice?.(q),
            data: q,
          });
        });
      }

      // 4. Fetch remediation/weakness data (REVIEW)
      const { data: remediationData } = await supabase
        .from('remediation_history')
        .select(`
          id,
          misconception_detected,
          ai_explanation,
          lecture_video_id,
          pause_point_id,
          resolved,
          lecture_videos (title)
        `)
        .eq('student_id', userId)
        .eq('resolved', false)
        .limit(3);

      if (remediationData && remediationData.length > 0) {
        hasAnyContent = true;
        remediationData.forEach((item, idx) => {
          const lectureTitle = (item.lecture_videos as any)?.title || 'Lecture';
          items.push({
            id: `remediation-${item.id}`,
            type: 'review',
            actionType: 'navigate',
            title: `Weakness: ${item.misconception_detected?.slice(0, 40) || 'Review needed'}`,
            description: item.ai_explanation?.slice(0, 80) || 'Practice to strengthen this concept',
            sourceContext: `Source: ${lectureTitle}`,
            priority: 85 - idx * 5,
            action: () => onNavigate?.('/training', { focusConcept: item.misconception_detected }),
            data: item,
          });
        });
      }

      // 5. Fetch upcoming lecture prep (PRIME)
      const { data: instructorConnection } = await supabase
        .from('instructor_students')
        .select('instructor_id')
        .eq('student_id', userId)
        .maybeSingle();

      if (instructorConnection?.instructor_id) {
        hasAnyContent = true;
        const { data: lectureVideos } = await supabase
          .from('lecture_videos')
          .select('id, title, duration_seconds')
          .eq('instructor_id', instructorConnection.instructor_id)
          .eq('published', true)
          .limit(2);

        if (lectureVideos) {
          lectureVideos.forEach((video, idx) => {
            const duration = video.duration_seconds 
              ? `${Math.round(video.duration_seconds / 60)} min` 
              : '5-10 min';
            items.push({
              id: `lecture-${video.id}`,
              type: 'prime',
              actionType: 'navigate',
              title: `Prep: ${video.title}`,
              description: 'Watch to prepare for upcoming class',
              timeEstimate: duration,
              priority: 75 - idx * 5,
              action: () => onNavigate?.(`/lecture/${video.id}`),
              data: video,
            });
          });
        }
      }

      // 6. Fetch student study materials needing more questions (PRIME)
      const { data: studyMaterials } = await supabase
        .from('student_study_materials')
        .select('id, title, material_type, questions_generated')
        .eq('user_id', userId)
        .lt('questions_generated', 5)
        .order('created_at', { ascending: false })
        .limit(2);

      if (studyMaterials && studyMaterials.length > 0) {
        hasAnyContent = true;
        studyMaterials.forEach((material, idx) => {
          const questionsLeft = 5 - (material.questions_generated || 0);
          items.push({
            id: `material-${material.id}`,
            type: 'prime',
            actionType: 'navigate',
            title: `Generate Questions: ${material.title}`,
            description: `Create ${questionsLeft} more practice questions`,
            timeEstimate: '2 min',
            priority: 70 - idx * 5,
            action: () => onNavigate?.('/training', { generateFor: material.id }),
            data: material,
          });
        });
      }

      // 7. Add daily challenges if not completed (PRIME)
      const today = new Date().toISOString().split('T')[0];
      const { data: challenges } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('user_id', userId)
        .eq('challenge_date', today)
        .eq('completed', false)
        .limit(1);

      if (challenges && challenges.length > 0) {
        hasAnyContent = true;
        items.push({
          id: 'daily-challenge',
          type: 'prime',
          actionType: 'challenge',
          title: 'Daily Challenge Available',
          description: `Complete today's challenge to earn ${challenges[0].xp_reward} XP`,
          timeEstimate: '5 min',
          priority: 80,
          action: () => onNavigate?.('/training'),
          data: challenges[0],
        });
      }

      // Sort by priority
      items.sort((a, b) => b.priority - a.priority);

      setData({
        items,
        nextItem: items[0] || null,
        loading: false,
        hasContent: hasAnyContent,
      });
    } catch (error) {
      console.error('Error fetching learning path:', error);
      setData(prev => ({ ...prev, loading: false, hasContent: false }));
    }
  }, [userId, classId, onNavigate, onPractice, onUpload]);

  useEffect(() => {
    fetchLearningPath();
  }, [fetchLearningPath]);

  return data;
}
