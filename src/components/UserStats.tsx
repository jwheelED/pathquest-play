import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UserStatsProps {
  userId: string;
  onStatsUpdate?: (stats: { level: number; streak: number }) => void;
}

interface UserStats {
  experience_points: number;
  level: number;
  coins: number;
  current_streak: number;
  longest_streak: number;
}

export default function UserStats({ userId, onStatsUpdate }: UserStatsProps) {
  const [stats, setStats] = useState<UserStats>({
    experience_points: 0,
    level: 1,
    coins: 0,
    current_streak: 0,
    longest_streak: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserStats();
    }
  }, [userId]);

  const fetchUserStats = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      let { data: userStats, error } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // User stats don't exist, create them
        const { data: newStats, error: insertError } = await supabase
          .from("user_stats")
          .insert([{ user_id: userId }])
          .select()
          .single();

        if (insertError) throw insertError;
        userStats = newStats;
      } else if (error) {
        throw error;
      }

      setStats(userStats || {
        experience_points: 0,
        level: 1,
        coins: 0,
        current_streak: 0,
        longest_streak: 0,
      });

      // Notify parent component of stats
      if (onStatsUpdate && userStats) {
        onStatsUpdate({ 
          level: userStats.level, 
          streak: userStats.current_streak 
        });
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
    }
    setLoading(false);
  };

  const calculateLevelProgress = () => {
    const baseXP = stats.level * 100;
    const nextLevelXP = (stats.level + 1) * 100;
    const currentLevelXP = stats.experience_points - (stats.level - 1) * 100;
    return (currentLevelXP / 100) * 100;
  };

  if (loading) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="h-20 bg-muted rounded"></div>
      </Card>
    );
  }

  return (
    <Card className="p-4 md:p-6 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/30 shadow-elegant">
      <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4 flex items-center gap-2">
        📊 Your Progress
      </h2>
      
      <div className="space-y-4">
        {/* Level and XP Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs md:text-sm font-bold">
              Level {stats.level}
            </Badge>
            <span className="text-xs md:text-sm text-muted-foreground font-mono">
              {stats.experience_points} XP
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${calculateLevelProgress()}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 md:gap-6">
          <div className="flex flex-col items-center p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur">
            <div className="text-2xl md:text-3xl mb-1 md:mb-2">💰</div>
            <div className="text-xl md:text-2xl font-bold text-primary">{stats.coins}</div>
            <div className="text-xs md:text-sm text-muted-foreground">Coins</div>
          </div>
          
          <div className="flex flex-col items-center p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur">
            <div className="text-2xl md:text-3xl mb-1 md:mb-2">🔥</div>
            <div className="text-xl md:text-2xl font-bold text-secondary">{stats.current_streak}</div>
            <div className="text-xs md:text-sm text-muted-foreground">Streak</div>
          </div>
          
          <div className="flex flex-col items-center p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur">
            <div className="text-2xl md:text-3xl mb-1 md:mb-2">🏆</div>
            <div className="text-xl md:text-2xl font-bold text-gamification-gold">{stats.longest_streak}</div>
            <div className="text-xs md:text-sm text-muted-foreground">Best</div>
          </div>
        </div>
      </div>
    </Card>
  );
}