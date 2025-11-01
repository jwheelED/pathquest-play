import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AchievementSystemProps {
  userId?: string;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement_type: string;
  requirement_value: number;
  points_reward: number;
}

interface UserAchievement {
  achievement_id: string;
  earned_at: string;
  achievements: Achievement;
}

export default function AchievementSystem({ userId }: AchievementSystemProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [earnedAchievements, setEarnedAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchAchievements();
      fetchUserAchievements();
      
      // Auto-check achievements periodically
      const interval = setInterval(() => {
        checkAndUnlockAchievements();
      }, 30000); // Check every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [userId]);

  const fetchAchievements = async () => {
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .order("requirement_value");

    if (!error && data) {
      setAchievements(data);
    }
  };

  const fetchUserAchievements = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("user_achievements")
      .select(`
        achievement_id,
        earned_at,
        achievements (*)
      `)
      .eq("user_id", userId);

    if (!error && data) {
      setEarnedAchievements(data as UserAchievement[]);
    }
  };

  const checkAndUnlockAchievements = async () => {
    if (!userId) return;
    
    setLoading(true);
    
    try {
      // Get user stats to check achievements
      const { data: stats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", userId)
        .single();

      const { data: lessonProgress } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("user_id", userId);

      const { data: problemAttempts } = await supabase
        .from("problem_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("is_correct", true);

      // Get check-in stats
      const { data: checkInAssignments } = await supabase
        .from("student_assignments")
        .select("*")
        .eq("student_id", userId)
        .eq("assignment_type", "lecture_checkin")
        .eq("completed", true);

      const { data: checkInStreaks } = await supabase
        .from("checkin_streaks")
        .select("*")
        .eq("user_id", userId)
        .single();

      // Count perfect check-ins (grade = 100)
      const perfectCheckIns = checkInAssignments?.filter(a => a.grade === 100).length || 0;

      if (!stats) return;

      // Check each achievement
      for (const achievement of achievements) {
        const alreadyEarned = earnedAchievements.some(
          ua => ua.achievement_id === achievement.id
        );
        
        if (alreadyEarned) continue;

        let shouldUnlock = false;

        switch (achievement.requirement_type) {
          case 'xp':
            shouldUnlock = stats.experience_points >= achievement.requirement_value;
            break;
          case 'streak':
            shouldUnlock = stats.current_streak >= achievement.requirement_value;
            break;
          case 'lessons_completed':
            shouldUnlock = (lessonProgress?.length || 0) >= achievement.requirement_value;
            break;
          case 'problems_solved':
            shouldUnlock = (problemAttempts?.length || 0) >= achievement.requirement_value;
            break;
          case 'checkins_completed':
            shouldUnlock = (checkInAssignments?.length || 0) >= achievement.requirement_value;
            break;
          case 'perfect_checkins':
            shouldUnlock = perfectCheckIns >= achievement.requirement_value;
            break;
          case 'checkin_streak':
            shouldUnlock = (checkInStreaks?.current_streak || 0) >= achievement.requirement_value;
            break;
          default:
            break;
        }

        if (shouldUnlock) {
          // Unlock achievement
          const { error } = await supabase
            .from("user_achievements")
            .insert([{
              user_id: userId,
              achievement_id: achievement.id,
            }]);

          if (!error) {
            // Update user stats with bonus points
            await supabase
              .from("user_stats")
              .update({
                experience_points: stats.experience_points + achievement.points_reward,
                coins: stats.coins + Math.floor(achievement.points_reward / 2),
              })
              .eq("user_id", userId);

            toast.success(`🏆 Achievement Unlocked!`, {
              description: `${achievement.name} - +${achievement.points_reward} XP`,
              duration: 5000,
            });

            // Refresh achievements
            fetchUserAchievements();
          }
        }
      }
    } catch (error) {
      console.error("Error checking achievements:", error);
    }
    
    setLoading(false);
  };

  const getAchievementProgress = (achievement: Achievement) => {
    // This would need actual user stats to calculate progress
    // For now, return 0 for unearned achievements
    return 0;
  };

  // Headless component - only check for achievements and trigger notifications
  // No UI rendered
  return null;
}