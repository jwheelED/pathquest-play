import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, TrendingDown, Target, Flame, Shield, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ConfidenceStats {
  totalGambles: number;
  successfulGambles: number;
  biggestWin: number;
  biggestLoss: number;
  confidenceAccuracy: {
    low: { correct: number; total: number };
    medium: { correct: number; total: number };
    high: { correct: number; total: number };
    very_high: { correct: number; total: number };
  };
  recentSessions: Array<{
    id: string;
    confidence_level: string;
    is_correct: boolean;
    xp_earned: number;
    coins_earned: number;
    created_at: string;
  }>;
}

interface ConfidenceAnalyticsProps {
  userId: string;
}

export function ConfidenceAnalytics({ userId }: ConfidenceAnalyticsProps) {
  const [stats, setStats] = useState<ConfidenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Fetch user stats
      const { data: userStats, error: statsError } = await supabase
        .from('user_stats')
        .select('total_gambles, successful_gambles, biggest_win, biggest_loss, confidence_accuracy')
        .eq('user_id', userId)
        .single();

      if (statsError) throw statsError;

      // Fetch recent practice sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('practice_sessions')
        .select('id, confidence_level, is_correct, xp_earned, coins_earned, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (sessionsError) throw sessionsError;

      const defaultAccuracy = {
        low: { correct: 0, total: 0 },
        medium: { correct: 0, total: 0 },
        high: { correct: 0, total: 0 },
        very_high: { correct: 0, total: 0 },
      };

      setStats({
        totalGambles: userStats?.total_gambles || 0,
        successfulGambles: userStats?.successful_gambles || 0,
        biggestWin: userStats?.biggest_win || 0,
        biggestLoss: userStats?.biggest_loss || 0,
        confidenceAccuracy: (userStats?.confidence_accuracy as any) || defaultAccuracy,
        recentSessions: sessions || [],
      });
    } catch (error: any) {
      toast({
        title: "Error loading stats",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  const winRate = stats.totalGambles > 0 
    ? Math.round((stats.successfulGambles / stats.totalGambles) * 100) 
    : 0;

  const getAccuracyRate = (level: keyof typeof stats.confidenceAccuracy) => {
    const acc = stats.confidenceAccuracy[level];
    return acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : 0;
  };

  const getConfidenceInsight = () => {
    const highAccuracy = getAccuracyRate('high');
    const veryHighAccuracy = getAccuracyRate('very_high');
    
    if (veryHighAccuracy > 80) {
      return { message: "🔥 You're a confidence master! Keep taking those risks!", type: "success" };
    }
    if (highAccuracy < 50 && stats.confidenceAccuracy.high.total > 5) {
      return { message: "⚠️ You're overconfident! Try being more cautious.", type: "warning" };
    }
    if (getAccuracyRate('low') > 70 && stats.confidenceAccuracy.low.total > 5) {
      return { message: "💪 You're too humble! Trust yourself more!", type: "info" };
    }
    return { message: "🎯 Keep practicing to improve your confidence calibration!", type: "default" };
  };

  const insight = getConfidenceInsight();

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Confidence Analytics
        </h3>
        <Badge variant="outline">{stats.totalGambles} Total Gambles</Badge>
      </div>

      {/* Insight Alert */}
      <div className={`p-4 rounded-lg border ${
        insight.type === 'success' ? 'bg-primary/10 border-primary/30' :
        insight.type === 'warning' ? 'bg-destructive/10 border-destructive/30' :
        'bg-accent/10 border-accent/30'
      }`}>
        <p className="text-sm font-medium">{insight.message}</p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-2xl font-bold text-primary">{winRate}%</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Biggest Win</p>
          <p className="text-2xl font-bold text-accent">+{stats.biggestWin}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Biggest Loss</p>
          <p className="text-2xl font-bold text-destructive">-{stats.biggestLoss}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Success</p>
          <p className="text-2xl font-bold text-foreground">{stats.successfulGambles}</p>
        </div>
      </div>

      {/* Confidence Level Breakdown */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-foreground">Accuracy by Confidence</h4>
        
        {[
          { level: 'very_high', label: 'Very High 🔥', icon: Flame, color: 'text-destructive' },
          { level: 'high', label: 'High 💪', icon: TrendingUp, color: 'text-accent' },
          { level: 'medium', label: 'Medium 🎯', icon: Target, color: 'text-primary' },
          { level: 'low', label: 'Low 🤔', icon: Shield, color: 'text-muted-foreground' },
        ].map(({ level, label, icon: Icon, color }) => {
          const accuracy = getAccuracyRate(level as keyof typeof stats.confidenceAccuracy);
          const total = stats.confidenceAccuracy[level as keyof typeof stats.confidenceAccuracy].total;
          
          return (
            <div key={level} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {accuracy}% ({total} attempts)
                </span>
              </div>
              <Progress value={accuracy} className="h-2" />
            </div>
          );
        })}
      </div>

      {/* Recent Sessions */}
      <Tabs defaultValue="recent" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="best">Best Wins</TabsTrigger>
        </TabsList>
        
        <TabsContent value="recent" className="space-y-2 mt-4">
          {stats.recentSessions.slice(0, 5).map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg border flex items-center justify-between ${
                session.is_correct ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'
              }`}
            >
              <div className="flex items-center gap-3">
                {session.is_correct ? (
                  <TrendingUp className="w-4 h-4 text-primary" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium capitalize">
                    {session.confidence_level.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(session.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className={`font-bold ${session.xp_earned >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {session.xp_earned >= 0 ? '+' : ''}{session.xp_earned} XP
              </div>
            </div>
          ))}
        </TabsContent>
        
        <TabsContent value="best" className="space-y-2 mt-4">
          {stats.recentSessions
            .filter(s => s.is_correct)
            .sort((a, b) => b.xp_earned - a.xp_earned)
            .slice(0, 5)
            .map((session) => (
              <div
                key={session.id}
                className="p-3 rounded-lg border bg-primary/5 border-primary/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Trophy className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {session.confidence_level.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="font-bold text-primary">
                  +{session.xp_earned} XP
                </div>
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
