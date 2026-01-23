import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Target, Brain, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdaptiveDifficultyData {
  current_difficulty: string;
  consecutive_correct: number;
  consecutive_incorrect: number;
  difficulty_history: any;
  total_questions_at_level: any;
  success_rate_by_level: any;
}

interface AdaptiveDifficultyIndicatorProps {
  userId: string;
  compact?: boolean;
}

const DIFFICULTY_CONFIG = {
  beginner: {
    label: 'Beginner',
    color: 'bg-green-500',
    textColor: 'text-green-600',
    icon: Target,
    description: 'Building foundations',
    threshold: 75,
  },
  intermediate: {
    label: 'Intermediate',
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    icon: Brain,
    description: 'Developing skills',
    threshold: 75,
  },
  advanced: {
    label: 'Advanced',
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    icon: Zap,
    description: 'Mastering concepts',
    threshold: 75,
  },
  expert: {
    label: 'Expert',
    color: 'bg-orange-500',
    textColor: 'text-orange-600',
    icon: TrendingUp,
    description: 'Peak performance',
    threshold: 100,
  },
};

export function AdaptiveDifficultyIndicator({ userId, compact = false }: AdaptiveDifficultyIndicatorProps) {
  const [difficultyData, setDifficultyData] = useState<AdaptiveDifficultyData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDifficultyData();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('adaptive-difficulty-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'adaptive_difficulty',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchDifficultyData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchDifficultyData = async () => {
    try {
      const { data, error } = await supabase.rpc('get_adaptive_difficulty', {
        p_user_id: userId
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setDifficultyData(data[0]);
      }
    } catch (error: any) {
      console.error("Error fetching difficulty data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !difficultyData) {
    return compact ? (
      <div className="animate-pulse">
        <div className="h-6 bg-muted rounded w-24"></div>
      </div>
    ) : null;
  }

  const config = DIFFICULTY_CONFIG[difficultyData.current_difficulty as keyof typeof DIFFICULTY_CONFIG];
  const Icon = config.icon;
  const successRate = (difficultyData.success_rate_by_level as any)?.[difficultyData.current_difficulty] || 0;
  const questionsAtLevel = (difficultyData.total_questions_at_level as any)?.[difficultyData.current_difficulty] || 0;
  
  // Calculate progress to next level
  const progressToNext = Math.min(
    (successRate / config.threshold) * 100,
    100
  );

  if (compact) {
    return (
      <Badge 
        variant="outline" 
        className={`${config.textColor} border-current font-semibold`}
      >
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  }

  return (
    <Card className="p-4 border-2 border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${config.color} bg-opacity-20`}>
              <Icon className={`w-5 h-5 ${config.textColor}`} />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Adaptive Difficulty</h3>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <Badge variant="default" className={`${config.color} text-white`}>
            {config.label}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="text-lg font-bold text-foreground">{Math.round(successRate)}%</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Questions</p>
            <p className="text-lg font-bold text-foreground">{questionsAtLevel}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Streak</p>
            <p className="text-lg font-bold text-foreground">
              {difficultyData.consecutive_correct > 0 ? (
                <span className="text-green-500">+{difficultyData.consecutive_correct}</span>
              ) : difficultyData.consecutive_incorrect > 0 ? (
                <span className="text-red-500">-{difficultyData.consecutive_incorrect}</span>
              ) : (
                <span>0</span>
              )}
            </p>
          </div>
        </div>

        {/* Progress to next level */}
        {difficultyData.current_difficulty !== 'expert' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress to next level</span>
              <span className="font-semibold text-foreground">{Math.round(progressToNext)}%</span>
            </div>
            <Progress value={progressToNext} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {difficultyData.consecutive_correct >= 4 ? (
                <span className="text-green-600 font-semibold">
                  🎯 Keep it up! {4 - difficultyData.consecutive_correct} more correct to level up
                </span>
              ) : (
                <>Get 4 consecutive correct answers with {config.threshold}% success rate to advance</>
              )}
            </p>
          </div>
        )}

        {/* Recent changes */}
        {difficultyData.difficulty_history && Array.isArray(difficultyData.difficulty_history) && difficultyData.difficulty_history.length > 0 && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Change</p>
            {(() => {
              const historyArray = difficultyData.difficulty_history as any[];
              const lastChange = historyArray[historyArray.length - 1];
              const isUpgrade = lastChange.reason === 'consistent_success';
              return (
                <div className="flex items-center gap-2 text-xs">
                  {isUpgrade ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-orange-500" />
                  )}
                  <span className="text-foreground">
                    {isUpgrade ? 'Leveled up' : 'Adjusted down'} from {lastChange.from} to {lastChange.to}
                  </span>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Card>
  );
}
