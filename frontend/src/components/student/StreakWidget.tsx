import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakWidgetProps {
  userId: string;
  className?: string;
}

export function StreakWidget({ userId, className }: StreakWidgetProps) {
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [weekDays, setWeekDays] = useState<boolean[]>([]);

  useEffect(() => {
    fetchStreakData();
  }, [userId]);

  const fetchStreakData = async () => {
    try {
      const { data } = await supabase
        .from("checkin_streaks")
        .select("current_streak, longest_streak, last_correct_date")
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        setStreak(data.current_streak);
        setLongestStreak(data.longest_streak);
        
        // Calculate week activity (simple mock - last 7 days)
        const today = new Date();
        const lastCorrect = data.last_correct_date ? new Date(data.last_correct_date) : null;
        const days: boolean[] = [];
        
        for (let i = 6; i >= 0; i--) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() - i);
          
          if (lastCorrect && data.current_streak > 0) {
            const streakStart = new Date(lastCorrect);
            streakStart.setDate(streakStart.getDate() - data.current_streak + 1);
            days.push(checkDate >= streakStart && checkDate <= lastCorrect);
          } else {
            days.push(false);
          }
        }
        setWeekDays(days);
      }
    } catch (error) {
      console.error("Error fetching streak:", error);
    }
  };

  const getDayLabel = (index: number) => {
    const days = ["S", "M", "T", "W", "T", "F", "S"];
    const today = new Date().getDay();
    const dayIndex = (today - 6 + index + 7) % 7;
    return days[dayIndex];
  };

  return (
    <div className={cn("headspace-card rounded-2xl p-4 border border-border/50", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            streak > 0 ? "bg-streak/10" : "bg-muted"
          )}>
            <Flame className={cn(
              "w-5 h-5",
              streak > 0 ? "text-streak animate-pulse" : "text-muted-foreground"
            )} />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{streak}</p>
            <p className="text-xs text-muted-foreground">day streak</p>
          </div>
        </div>
        {longestStreak > 0 && (
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Best</p>
            <p className="text-lg font-bold text-foreground">{longestStreak}</p>
          </div>
        )}
      </div>

      {/* Week Calendar */}
      <div className="flex justify-between gap-1">
        {weekDays.map((active, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{getDayLabel(index)}</span>
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                active
                  ? "bg-streak text-streak-foreground"
                  : "bg-muted/50 text-muted-foreground",
                index === 6 && "ring-2 ring-primary/30"
              )}
            >
              {active ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="text-xs opacity-50">·</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {streak >= 7 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-center text-streak font-medium">
            🔥 Amazing! {streak} days in a row!
          </p>
        </div>
      )}
    </div>
  );
}
