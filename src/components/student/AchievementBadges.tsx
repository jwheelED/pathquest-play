import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AchievementBadgesProps {
  userId: string;
}

interface UserAchievement {
  achievement_id: string;
  earned_at: string;
  achievements: {
    id: string;
    name: string;
    icon: string;
    description: string;
    tier: string;
  };
}

export const AchievementBadges = ({ userId }: AchievementBadgesProps) => {
  const [earnedAchievements, setEarnedAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEarnedAchievements();
  }, [userId]);

  const fetchEarnedAchievements = async () => {
    try {
      const { data, error } = await supabase
        .from("user_achievements")
        .select(`
          achievement_id,
          earned_at,
          achievements (
            id,
            name,
            icon,
            description,
            tier
          )
        `)
        .eq("user_id", userId)
        .order("earned_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      setEarnedAchievements(data as UserAchievement[]);
    } catch (error) {
      console.error("Error fetching achievements:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-32 mb-3"></div>
          <div className="flex gap-2">
            <div className="h-12 w-12 bg-muted rounded-full"></div>
            <div className="h-12 w-12 bg-muted rounded-full"></div>
            <div className="h-12 w-12 bg-muted rounded-full"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (earnedAchievements.length === 0) {
    return (
      <Card className="p-4 bg-muted/30">
        <p className="text-sm text-muted-foreground text-center">
          No achievements earned yet. Complete assignments and check-ins to earn badges!
        </p>
      </Card>
    );
  }

  const getTierBorderColor = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'border-[hsl(var(--badge-bronze))]';
      case 'silver': return 'border-[hsl(var(--badge-silver))]';
      case 'gold': return 'border-[hsl(var(--badge-gold))]';
      case 'platinum': return 'border-[hsl(var(--badge-platinum))]';
      default: return 'border-achievement';
    }
  };

  const getTierGlow = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'shadow-[0_0_20px_hsl(var(--badge-bronze-glow)/0.6)]';
      case 'silver': return 'shadow-[0_0_20px_hsl(var(--badge-silver-glow)/0.6)]';
      case 'gold': return 'shadow-[0_0_20px_hsl(var(--badge-gold-glow)/0.6)]';
      case 'platinum': return 'shadow-[0_0_20px_hsl(var(--badge-platinum-glow)/0.6)]';
      default: return 'shadow-achievement';
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-achievement/10 to-transparent border-achievement-glow">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-achievement-foreground flex items-center gap-2">
            🏆 Recent Badges
          </h3>
          <Badge variant="secondary" className="text-xs">
            {earnedAchievements.length}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {earnedAchievements.map((ua) => (
            <div
              key={ua.achievement_id}
              className="group relative"
              title={`${ua.achievements.name}: ${ua.achievements.description}`}
            >
              <div className={`w-14 h-14 rounded-full bg-card/50 backdrop-blur border-2 ${getTierBorderColor(ua.achievements.tier)} flex items-center justify-center text-2xl ${getTierGlow(ua.achievements.tier)} transition-all duration-200 hover:scale-110 cursor-pointer animate-pulse-glow`}>
                {ua.achievements.icon}
              </div>
              
              {/* Tier indicator */}
              <div className="absolute -top-1 -right-1">
                <Badge variant={ua.achievements.tier as any} className="text-[8px] px-1 py-0 h-4">
                  {ua.achievements.tier[0].toUpperCase()}
                </Badge>
              </div>
              
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-popover text-popover-foreground text-xs rounded-lg p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold">{ua.achievements.name}</p>
                  <Badge variant={ua.achievements.tier as any} className="text-[8px] px-1">
                    {ua.achievements.tier}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">{ua.achievements.description}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Earned: {new Date(ua.earned_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {earnedAchievements.length >= 5 && (
          <div className="pt-2 border-t border-achievement-glow/30">
            <p className="text-xs text-achievement-foreground/80 text-center">
              Amazing progress! Keep earning more badges! 🎉
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
