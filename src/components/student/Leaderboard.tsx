import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  level: number;
  experience_points: number;
  coins: number;
  current_streak: number;
}

interface LeaderboardProps {
  userId: string;
}

export function Leaderboard({ userId }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const fetchLeaderboard = async () => {
    try {
      // Get current user's instructor to fetch classmates
      const { data: connection } = await supabase
        .from('instructor_students')
        .select('instructor_id')
        .eq('student_id', userId)
        .maybeSingle();

      if (!connection) {
        setLoading(false);
        return;
      }

      // Get all students from the same instructor
      const { data: classmates } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', connection.instructor_id);

      if (!classmates || classmates.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = classmates.map(c => c.student_id);

      // Fetch user stats for all classmates
      const { data: stats, error } = await supabase
        .from('user_stats')
        .select('user_id, level, experience_points, coins, current_streak')
        .in('user_id', studentIds)
        .order('experience_points', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!stats || stats.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch profile names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', stats.map(s => s.user_id));

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      const leaderboardData = stats.map(stat => ({
        ...stat,
        full_name: profileMap.get(stat.user_id) || 'Anonymous',
      }));

      setLeaderboard(leaderboardData);

      // Find user's rank
      const rank = leaderboardData.findIndex(entry => entry.user_id === userId);
      setUserRank(rank >= 0 ? rank + 1 : null);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      toast.error('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-700" />;
    return null;
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return "gold";
    if (index === 1) return "silver";
    if (index === 2) return "bronze";
    return "outline";
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-card to-accent/5 border-2 border-accent/20">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Card className="p-6 bg-gradient-to-br from-card to-accent/5 border-2 border-accent/20">
        <div className="text-center py-8 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No leaderboard data yet</p>
          <p className="text-sm">Complete challenges to see your ranking</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-accent/5 border-2 border-accent/20 shadow-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-lg">
              <TrendingUp className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Class Leaderboard</h3>
              {userRank && (
                <p className="text-sm text-muted-foreground">
                  You're ranked #{userRank}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {leaderboard.map((entry, index) => {
            const isCurrentUser = entry.user_id === userId;
            const rankIcon = getRankIcon(index);
            const badgeVariant = getRankBadge(index) as "gold" | "silver" | "bronze" | "outline";

            return (
              <div
                key={entry.user_id}
                className={`p-3 rounded-lg border transition-all ${
                  isCurrentUser
                    ? 'bg-primary/10 border-primary shadow-md'
                    : 'bg-card border-border hover:border-accent/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8">
                    {rankIcon || (
                      <span className="text-lg font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                      {entry.full_name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {entry.full_name}
                        {isCurrentUser && (
                          <span className="text-primary ml-1">(You)</span>
                        )}
                      </p>
                      {entry.current_streak > 0 && (
                        <Badge variant="outline" className="text-xs">
                          🔥 {entry.current_streak}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Level {entry.level} • {entry.experience_points.toLocaleString()} XP
                    </p>
                  </div>

                  <Badge variant={badgeVariant} className="text-xs">
                    🪙 {entry.coins}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
