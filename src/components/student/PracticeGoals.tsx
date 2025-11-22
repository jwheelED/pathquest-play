import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, Plus, Calendar, Award } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface PracticeGoal {
  id: string;
  goal_type: string;
  target_value: number;
  current_progress: number;
  deadline: string;
  completed: boolean;
  xp_reward: number;
}

interface PracticeGoalsProps {
  userId: string;
}

const goalLabels = {
  daily_practice: "Daily Practice Streak",
  weekly_wins: "Weekly Wins Target",
  accuracy_target: "Accuracy Improvement",
};

export function PracticeGoals({ userId }: PracticeGoalsProps) {
  const [goals, setGoals] = useState<PracticeGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGoals();
    
    const channel = supabase
      .channel('practice_goals_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practice_goals',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchGoals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('practice_goals')
        .select('*')
        .eq('user_id', userId)
        .gte('deadline', new Date().toISOString().split('T')[0])
        .order('deadline', { ascending: true });

      if (error) throw error;
      
      // Create default goal if none exist
      if (!data || data.length === 0) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const { data: created, error: createError } = await supabase
          .from('practice_goals')
          .insert({
            user_id: userId,
            goal_type: 'weekly_wins',
            target_value: 20,
            deadline: nextWeek.toISOString().split('T')[0],
            xp_reward: 200,
          })
          .select()
          .single();

        if (createError) throw createError;
        setGoals(created ? [created] : []);
      } else {
        setGoals(data);
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
      toast.error('Failed to load practice goals');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-card to-secondary/5 border-2 border-secondary/20">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-24 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-secondary/5 border-2 border-secondary/20 shadow-elegant">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/20 rounded-lg">
              <Target className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Practice Goals</h3>
              <p className="text-sm text-muted-foreground">Track your progress</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Goal
          </Button>
        </div>

        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No active goals</p>
              <p className="text-sm">Create a goal to track your progress</p>
            </div>
          ) : (
            goals.map((goal) => {
              const progress = (goal.current_progress / goal.target_value) * 100;
              const daysLeft = differenceInDays(new Date(goal.deadline), new Date());
              const label = goalLabels[goal.goal_type as keyof typeof goalLabels];

              return (
                <div
                  key={goal.id}
                  className={`p-4 rounded-lg border-2 ${
                    goal.completed
                      ? 'bg-secondary/10 border-secondary/50'
                      : 'bg-card border-border'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        {label}
                        {goal.completed && (
                          <Award className="w-4 h-4 text-secondary" />
                        )}
                      </h4>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-sm text-muted-foreground">
                          {goal.current_progress} / {goal.target_value}
                        </p>
                        <Badge variant="outline" className="text-xs gap-1">
                          <Calendar className="w-3 h-3" />
                          {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-secondary">
                        +{goal.xp_reward} XP
                      </div>
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {progress >= 100 && !goal.completed && (
                    <p className="text-xs text-secondary mt-2">🎉 Goal completed! Claim your reward.</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}
