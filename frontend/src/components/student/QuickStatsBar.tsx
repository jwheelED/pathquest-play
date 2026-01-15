import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap, CheckCircle2, Clock, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickStatsBarProps {
  userId: string;
  className?: string;
}

interface DailyStats {
  xpToday: number;
  questionsToday: number;
  minutesToday: number;
  streak: number;
}

export function QuickStatsBar({ userId, className }: QuickStatsBarProps) {
  const [stats, setStats] = useState<DailyStats>({
    xpToday: 0,
    questionsToday: 0,
    minutesToday: 0,
    streak: 0,
  });

  useEffect(() => {
    fetchDailyStats();
  }, [userId]);

  const fetchDailyStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [userStatsData, questionsData, streakData] = await Promise.all([
        supabase
          .from("user_stats")
          .select("experience_points, coins, current_streak")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("student_assignments")
          .select("id, created_at")
          .eq("student_id", userId)
          .gte("created_at", today.toISOString()),
        supabase
          .from("checkin_streaks")
          .select("current_streak")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      setStats({
        xpToday: userStatsData.data?.experience_points || 0,
        questionsToday: questionsData.data?.length || 0,
        minutesToday: Math.floor(Math.random() * 30) + 5, // Mock for now
        streak: streakData.data?.current_streak || 0,
      });
    } catch (error) {
      console.error("Error fetching daily stats:", error);
    }
  };

  const statItems = [
    {
      icon: Zap,
      value: stats.xpToday,
      label: "XP",
      color: "text-primary bg-primary/10",
    },
    {
      icon: CheckCircle2,
      value: stats.questionsToday,
      label: "Today",
      color: "text-success bg-success/10",
    },
    {
      icon: Clock,
      value: `${stats.minutesToday}m`,
      label: "Time",
      color: "text-secondary bg-secondary/10",
    },
    {
      icon: Flame,
      value: stats.streak,
      label: "Streak",
      color: "text-streak bg-streak/10",
    },
  ];

  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 scrollbar-hide", className)}>
      {statItems.map((item, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-full whitespace-nowrap",
            item.color
          )}
        >
          <item.icon className="w-4 h-4" />
          <span className="font-semibold text-sm">{item.value}</span>
          <span className="text-xs opacity-70">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
