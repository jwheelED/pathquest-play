import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UserStatsProps {
  userId?: string;
}

interface UserStats {
  experience_points: number;
  level: number;
  coins: number;
  current_streak: number;
  longest_streak: number;
}

export default function UserStats({ userId }: UserStatsProps) {
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
    <Card className="p-6 bg-gradient-primary border-2 border-primary-glow shadow-glow">
      <div className="space-y-4">
        {/* Level and XP */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-achievement text-achievement-foreground font-bold text-lg px-3 py-1">
                Level {stats.level}
              </Badge>
              <span className="text-primary-foreground font-mono text-sm">
                {stats.experience_points} XP
              </span>
            </div>
            <div className="w-full bg-primary-foreground/20 rounded-full h-3">
              <div 
                className="bg-gradient-achievement h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${calculateLevelProgress()}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-coins">💰</div>
            <div className="text-primary-foreground font-bold">{stats.coins}</div>
            <div className="text-primary-foreground/80 text-xs">Coins</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-streak">🔥</div>
            <div className="text-primary-foreground font-bold">{stats.current_streak}</div>
            <div className="text-primary-foreground/80 text-xs">Streak</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-achievement">🏆</div>
            <div className="text-primary-foreground font-bold">{stats.longest_streak}</div>
            <div className="text-primary-foreground/80 text-xs">Best</div>
          </div>
        </div>
      </div>
    </Card>
  );
}