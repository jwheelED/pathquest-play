import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Trophy } from "lucide-react";

interface BadgesButtonProps {
  userId: string;
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  category: string;
  points_reward: number;
  requirement_type: string;
  requirement_value: number;
}

interface UserAchievement {
  achievement_id: string;
  earned_at: string;
}

export const BadgesButton = ({ userId }: BadgesButtonProps) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [earnedAchievements, setEarnedAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      const { data: allAchievements, error: achError } = await supabase
        .from("achievements")
        .select("*")
        .order("tier", { ascending: true });

      if (achError) throw achError;

      const { data: earned, error: earnedError } = await supabase
        .from("user_achievements")
        .select("achievement_id, earned_at")
        .eq("user_id", userId);

      if (earnedError) throw earnedError;

      setAchievements(allAchievements as Achievement[]);
      setEarnedAchievements(earned as UserAchievement[]);
    } catch (error) {
      console.error("Error fetching badge data:", error);
    } finally {
      setLoading(false);
    }
  };

  const isEarned = (achievementId: string) => {
    return earnedAchievements.some(ua => ua.achievement_id === achievementId);
  };

  const getEarnedDate = (achievementId: string) => {
    const earned = earnedAchievements.find(ua => ua.achievement_id === achievementId);
    return earned ? new Date(earned.earned_at).toLocaleDateString() : null;
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'bronze';
      case 'silver': return 'silver';
      case 'gold': return 'gold';
      case 'platinum': return 'platinum';
      default: return 'default';
    }
  };

  const categories = [
    { value: 'all', label: '🎯 All', icon: '🎯' },
    { value: 'practice', label: '📝 Practice', icon: '📝' },
    { value: 'lecture', label: '🎓 Lecture', icon: '🎓' },
    { value: 'streak', label: '🔥 Streaks', icon: '🔥' },
    { value: 'mastery', label: '⭐ Mastery', icon: '⭐' },
  ];

  const filteredAchievements = selectedCategory === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === selectedCategory);

  const earnedCount = achievements.filter(a => isEarned(a.id)).length;
  const totalCount = achievements.length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Trophy className="w-4 h-4" />
          Badges ({earnedCount}/{totalCount})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            🏆 Badge Collection
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs defaultValue="all" onValueChange={setSelectedCategory}>
              <TabsList className="grid w-full grid-cols-5 gap-1">
                {categories.map(cat => (
                  <TabsTrigger key={cat.value} value={cat.value} className="text-xs">
                    <span className="mr-1">{cat.icon}</span>
                    <span className="hidden md:inline">{cat.label.replace(/[^a-zA-Z\s]/g, '')}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={selectedCategory} className="mt-6">
                {filteredAchievements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No badges in this category yet
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredAchievements.map(achievement => {
                      const earned = isEarned(achievement.id);
                      const earnedDate = getEarnedDate(achievement.id);
                      
                      return (
                        <div
                          key={achievement.id}
                          className={`p-4 relative transition-all duration-300 rounded-lg border-2 ${
                            earned 
                              ? 'bg-gradient-to-br from-card to-achievement/10 border-achievement/50 shadow-achievement' 
                              : 'bg-muted/30 border-dashed border-muted opacity-60'
                          }`}
                        >
                          <div className="absolute top-2 right-2">
                            <Badge variant={getTierColor(achievement.tier) as any} className="text-xs">
                              {achievement.tier}
                            </Badge>
                          </div>

                          <div className="flex flex-col items-center text-center space-y-2">
                            <div className={`text-5xl ${earned ? 'animate-pulse-glow' : 'grayscale'}`}>
                              {earned ? achievement.icon : <Lock className="w-12 h-12 text-muted-foreground" />}
                            </div>

                            <h3 className="font-bold text-sm line-clamp-1">
                              {achievement.name}
                            </h3>

                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {achievement.description}
                            </p>

                            {earned ? (
                              <div className="text-xs text-achievement-foreground bg-achievement/20 px-2 py-1 rounded">
                                ✓ Earned {earnedDate}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                🔒 Locked
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Collection Progress</span>
                <span className="font-bold text-primary">
                  {((earnedCount / totalCount) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-primary transition-all duration-500"
                  style={{ width: `${(earnedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};