import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ReadinessData {
  readiness: number;
  conceptMastery: number;
  assignmentsProgress: number;
  challengesProgress: number;
  loading: boolean;
}

export function useReadinessScore(userId: string, classId?: string): ReadinessData {
  const [data, setData] = useState<ReadinessData>({
    readiness: 0,
    conceptMastery: 0,
    assignmentsProgress: 0,
    challengesProgress: 0,
    loading: true,
  });

  useEffect(() => {
    if (!userId) return;

    const calculateReadiness = async () => {
      try {
        // 1. Fetch concept mastery scores
        const { data: masteryData } = await supabase
          .from('student_concept_mastery')
          .select('strength_score')
          .eq('student_id', userId);

        const avgMastery = masteryData?.length 
          ? masteryData.reduce((sum, m) => sum + (m.strength_score || 0), 0) / masteryData.length 
          : 0;

        // 2. Fetch pending assignments
        const { data: assignments } = await supabase
          .from('student_assignments')
          .select('completed')
          .eq('student_id', userId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        const completedAssignments = assignments?.filter(a => a.completed).length || 0;
        const totalAssignments = assignments?.length || 1;
        const assignmentRate = (completedAssignments / totalAssignments) * 100;

        // 3. Fetch daily challenges completion
        const today = new Date().toISOString().split('T')[0];
        const { data: challenges } = await supabase
          .from('daily_challenges')
          .select('completed')
          .eq('user_id', userId)
          .eq('challenge_date', today);

        const completedChallenges = challenges?.filter(c => c.completed).length || 0;
        const totalChallenges = challenges?.length || 1;
        const challengeRate = (completedChallenges / totalChallenges) * 100;

        // Calculate weighted readiness score
        // 50% concept mastery, 30% assignments, 20% daily challenges
        const readiness = Math.round(
          (avgMastery * 0.5) + 
          (assignmentRate * 0.3) + 
          (challengeRate * 0.2)
        );

        setData({
          readiness: Math.min(100, Math.max(0, readiness)),
          conceptMastery: Math.round(avgMastery),
          assignmentsProgress: Math.round(assignmentRate),
          challengesProgress: Math.round(challengeRate),
          loading: false,
        });
      } catch (error) {
        console.error('Error calculating readiness:', error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };

    calculateReadiness();
  }, [userId, classId]);

  return data;
}
