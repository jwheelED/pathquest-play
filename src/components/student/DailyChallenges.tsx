import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, Flame, Upload, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface DailyChallenge {
  id: string;
  challenge_type: string;
  target_value: number;
  current_progress: number;
  completed: boolean;
  xp_reward: number;
  coins_reward: number;
  challenge_date: string;
}

interface DailyChallengesProps {
  userId: string;
}

const challengeIcons = {
  practice_count: Target,
  confidence_win: Trophy,
  streak: Flame,
  study_upload: Upload,
};

const challengeLabels = {
  practice_count: "Practice Problems",
  confidence_win: "Win with High Confidence",
  streak: "Maintain Streak",
  study_upload: "Upload Study Materials",
};

export function DailyChallenges({ userId }: DailyChallengesProps) {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChallenges();
    
    // Subscribe to changes
    const channel = supabase
      .channel('daily_challenges_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_challenges',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchChallenges()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchChallenges = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch today's challenges
      const { data: existingChallenges, error: fetchError } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('user_id', userId)
        .eq('challenge_date', today);

      if (fetchError) throw fetchError;

      // If no challenges exist for today, create them
      if (!existingChallenges || existingChallenges.length === 0) {
        const newChallenges = [
          { challenge_type: 'practice_count', target_value: 10, xp_reward: 50, coins_reward: 25 },
          { challenge_type: 'confidence_win', target_value: 3, xp_reward: 75, coins_reward: 40 },
          { challenge_type: 'streak', target_value: 1, xp_reward: 30, coins_reward: 15 },
        ];

        const { data: created, error: createError } = await supabase
          .from('daily_challenges')
          .insert(
            newChallenges.map(c => ({
              user_id: userId,
              ...c,
            }))
          )
          .select();

        if (createError) throw createError;
        setChallenges(created || []);
      } else {
        setChallenges(existingChallenges);
      }
    } catch (error) {
      console.error('Error fetching challenges:', error);
      toast.error('Failed to load daily challenges');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-card to-primary/5 border-2 border-primary/20">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

  const completedCount = challenges.filter(c => c.completed).length;
  const totalCount = challenges.length;

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-primary/5 border-2 border-primary/20 shadow-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Daily Challenges</h3>
              <p className="text-sm text-muted-foreground">
                {completedCount} of {totalCount} completed
              </p>
            </div>
          </div>
          {completedCount === totalCount && totalCount > 0 && (
            <Badge variant="gold" className="text-sm">
              All Done! 🎉
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          {challenges.map((challenge) => {
            const Icon = challengeIcons[challenge.challenge_type as keyof typeof challengeIcons];
            const label = challengeLabels[challenge.challenge_type as keyof typeof challengeLabels];
            const progress = (challenge.current_progress / challenge.target_value) * 100;

            return (
              <div
                key={challenge.id}
                className={`p-4 rounded-lg border-2 transition-all ${
                  challenge.completed
                    ? 'bg-primary/10 border-primary/50'
                    : 'bg-card border-border hover:border-primary/30'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${challenge.completed ? 'bg-primary/20' : 'bg-muted'}`}>
                      {challenge.completed ? (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      ) : (
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">{label}</h4>
                      <p className="text-sm text-muted-foreground">
                        {challenge.current_progress} / {challenge.target_value}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-primary">
                      +{challenge.xp_reward} XP
                    </div>
                    <div className="text-xs text-muted-foreground">
                      +{challenge.coins_reward} 🪙
                    </div>
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
