import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PathItemType = 'prime' | 'core' | 'review';

export interface PathItem {
  id: string;
  type: PathItemType;
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
}

export function useLearningPath(
  userId: string, 
  classId?: string,
  onNavigate?: (path: string, state?: any) => void
): LearningPathData {
  const [data, setData] = useState<LearningPathData>({
    items: [],
    nextItem: null,
    loading: true,
  });

  useEffect(() => {
    if (!userId) return;

    const fetchLearningPath = async () => {
      try {
        const items: PathItem[] = [];

        // 1. Fetch incomplete assignments (CORE items)
        const { data: assignments } = await supabase
          .from('student_assignments')
          .select('*')
          .eq('student_id', userId)
          .eq('completed', false)
          .order('created_at', { ascending: false })
          .limit(5);

        if (assignments) {
          assignments.forEach((assignment, idx) => {
            items.push({
              id: assignment.id,
              type: 'core',
              title: assignment.title || 'Assignment',
              description: `Complete this ${assignment.assignment_type} assignment`,
              timeEstimate: '10-15 min',
              priority: 100 - idx * 10,
              action: () => onNavigate?.('/dashboard', { openAssignment: assignment.id }),
              data: assignment,
            });
          });
        }

        // 2. Fetch remediation/weakness data (REVIEW items)
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

        if (remediationData) {
          remediationData.forEach((item, idx) => {
            const lectureTitle = (item.lecture_videos as any)?.title || 'Lecture';
            items.push({
              id: item.id,
              type: 'review',
              title: `Weakness Detected: ${item.misconception_detected?.slice(0, 50) || 'Review needed'}`,
              description: item.ai_explanation?.slice(0, 100) || 'Practice to strengthen this concept',
              sourceContext: `Source: ${lectureTitle}`,
              priority: 90 - idx * 10,
              action: () => onNavigate?.('/training', { focusConcept: item.misconception_detected }),
              data: item,
            });
          });
        }

        // 3. Fetch upcoming lecture prep (PRIME items)
        const { data: instructorConnection } = await supabase
          .from('instructor_students')
          .select('instructor_id')
          .eq('student_id', userId)
          .maybeSingle();

        if (instructorConnection?.instructor_id) {
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
                id: video.id,
                type: 'prime',
                title: `Prep: ${video.title}`,
                description: 'Watch to prepare for upcoming class',
                timeEstimate: duration,
                priority: 80 - idx * 10,
                action: () => onNavigate?.(`/lecture/${video.id}`),
                data: video,
              });
            });
          }
        }

        // 4. Add daily challenges if not completed
        const today = new Date().toISOString().split('T')[0];
        const { data: challenges } = await supabase
          .from('daily_challenges')
          .select('*')
          .eq('user_id', userId)
          .eq('challenge_date', today)
          .eq('completed', false)
          .limit(1);

        if (challenges && challenges.length > 0) {
          items.push({
            id: 'daily-challenge',
            type: 'prime',
            title: 'Daily Challenge Available',
            description: `Complete today's challenge to earn ${challenges[0].xp_reward} XP`,
            timeEstimate: '5 min',
            priority: 95,
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
        });
      } catch (error) {
        console.error('Error fetching learning path:', error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };

    fetchLearningPath();
  }, [userId, classId, onNavigate]);

  return data;
}
