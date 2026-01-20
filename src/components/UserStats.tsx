import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/hooks/useOrgId";
import { Trophy, Flame, Coins, Star } from "lucide-react";

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

    const channel = supabase
      .channel(`user-stats-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_stats',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Stats updated in real-time:', payload);
          if (payload.new) {
            const newStats = payload.new as UserStats;
            setStats(newStats);
            
            if (onStatsUpdate) {
              onStatsUpdate({ 
                level: newStats.level, 
                streak: newStats.current_streak 
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
        const orgId = await getOrgId(userId);
        const { data: newStats, error: insertError } = await supabase
          .from("user_stats")
          .insert([{ user_id: userId, org_id: orgId }])
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
    const currentLevelXP = stats.experience_points - (stats.level - 1) * 100;
    return Math.min((currentLevelXP / 100) * 100, 100);
  };

  if (loading) {
    return (
      <div className="bento-card p-5 animate-pulse">
        <div className="h-20 bg-muted rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="bento-card p-5">
      {/* Level Progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Level</p>
            <p className="text-xl font-bold text-foreground">{stats.level}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">{stats.experience_points} XP</p>
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-primary rounded-full transition-all duration-500"
              style={{ width: `${calculateLevelProgress()}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <Coins className="w-5 h-5 text-coins mb-1" />
          <span className="text-lg font-bold text-foreground">{stats.coins}</span>
          <span className="text-[10px] text-muted-foreground">Coins</span>
        </div>
        
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <Flame className="w-5 h-5 text-streak mb-1" />
          <span className="text-lg font-bold text-foreground">{stats.current_streak}</span>
          <span className="text-[10px] text-muted-foreground">Streak</span>
        </div>
        
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <Star className="w-5 h-5 text-achievement mb-1" />
          <span className="text-lg font-bold text-foreground">{stats.longest_streak}</span>
          <span className="text-[10px] text-muted-foreground">Best</span>
        </div>
      </div>
    </div>
  );
}
