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

  return (
    <Card className="p-6 bg-gradient-achievement border-2 border-achievement-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-achievement-foreground flex items-center gap-2">
            🏆 Achievements
          </h3>
          <Button 
            onClick={checkAndUnlockAchievements}
            variant="neon"
            size="sm"
            disabled={loading}
          >
            {loading ? "Checking..." : "Check Progress"}
          </Button>
        </div>

        <div className="grid gap-4 max-h-64 overflow-y-auto">
          {achievements.map((achievement) => {
            const isEarned = earnedAchievements.some(
              ua => ua.achievement_id === achievement.id
            );
            const earnedDate = earnedAchievements.find(
              ua => ua.achievement_id === achievement.id
            )?.earned_at;

            return (
              <div
                key={achievement.id}
                className={`
                  p-4 rounded-lg border-2 transition-all duration-200
                  ${isEarned 
                    ? 'border-achievement bg-achievement/20 shadow-achievement animate-pulse-glow' 
                    : 'border-muted bg-muted/10 opacity-60'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{achievement.icon}</div>
                    <div className="space-y-1">
                      <h4 className="font-semibold text-achievement-foreground">
                        {achievement.name}
                      </h4>
                      <p className="text-sm text-achievement-foreground/80">
                        {achievement.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          +{achievement.points_reward} XP
                        </Badge>
                        {isEarned && earnedDate && (
                          <Badge variant="secondary" className="text-xs">
                            Earned {new Date(earnedDate).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {isEarned && (
                    <div className="text-2xl animate-level-up">✅</div>
                  )}
                </div>
                
                {!isEarned && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-achievement-foreground/70 mb-1">
                      <span>Progress</span>
                      <span>{getAchievementProgress(achievement)}/{achievement.requirement_value}</span>
                    </div>
                    <div className="w-full bg-achievement-foreground/20 rounded-full h-2">
                      <div 
                        className="bg-achievement h-2 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, (getAchievementProgress(achievement) / achievement.requirement_value) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-center pt-4 border-t border-achievement-glow/30">
          <p className="text-sm text-achievement-foreground/80">
            {earnedAchievements.length} / {achievements.length} Unlocked
          </p>
        </div>
      </div>
    </Card>
  );
}