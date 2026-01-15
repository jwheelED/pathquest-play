import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Target, Flame, Upload, CheckCircle, Sparkles } from "lucide-react";
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
  confidence_win: Sparkles,
  streak: Flame,
  study_upload: Upload,
};

const challengeLabels = {
  practice_count: "Practice Problems",
  confidence_win: "Win with Confidence",
  streak: "Maintain Streak",
  study_upload: "Upload Materials",
};

export function DailyChallenges({ userId }: DailyChallengesProps) {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChallenges();
    
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
      
      const { data: existingChallenges, error: fetchError } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('user_id', userId)
        .eq('challenge_date', today);

      if (fetchError) throw fetchError;

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
      <div className="bento-card p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const completedCount = challenges.filter(c => c.completed).length;
  const totalCount = challenges.length;

  return (
    <div className="bento-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-achievement/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-achievement" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Daily Challenges</h3>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{totalCount} completed
            </p>
          </div>
        </div>
        {completedCount === totalCount && totalCount > 0 && (
          <span className="stat-pill bg-energy/10 text-energy text-xs">
            All Done!
          </span>
        )}
      </div>

      <div className="space-y-3">
        {challenges.map((challenge, index) => {
          const Icon = challengeIcons[challenge.challenge_type as keyof typeof challengeIcons] || Target;
          const label = challengeLabels[challenge.challenge_type as keyof typeof challengeLabels] || challenge.challenge_type;
          const progress = (challenge.current_progress / challenge.target_value) * 100;

          return (
            <div
              key={challenge.id}
              className={`p-4 rounded-xl border transition-all animate-fade-in ${
                challenge.completed
                  ? 'bg-energy/5 border-energy/20'
                  : 'bg-muted/30 border-transparent hover:border-border'
              }`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    challenge.completed ? 'bg-energy/15' : 'bg-muted'
                  }`}>
                    {challenge.completed ? (
                      <CheckCircle className="w-4 h-4 text-energy" />
                    ) : (
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {challenge.current_progress}/{challenge.target_value}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-primary">+{challenge.xp_reward} XP</p>
                  <p className="text-[10px] text-muted-foreground">+{challenge.coins_reward} coins</p>
                </div>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
