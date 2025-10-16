import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Brain, Target, Lightbulb, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AnalyticsData {
  engagementChange: number;
  avgCompletionRate: number;
  confusingTopics: Array<{ topic: string; failureRate: number; attemptCount: number }>;
  strongTopics: Array<{ topic: string; successRate: number }>;
  weeklyActivity: number;
  totalStudents: number;
}

export function TeachingAnalytics({ instructorId }: { instructorId: string }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [instructorId]);

  const fetchAnalytics = async () => {
    try {
      // Get students for this instructor
      const { data: studentLinks } = await supabase
        .from("instructor_students")
        .select("student_id")
        .eq("instructor_id", instructorId);

      if (!studentLinks || studentLinks.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      // Fetch completion data for engagement trends
      const [thisWeekProgress, lastWeekProgress, problemAttempts, assignments] = await Promise.all([
        supabase
          .from("lesson_progress")
          .select("user_id")
          .in("user_id", studentIds)
          .gte("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("lesson_progress")
          .select("user_id")
          .in("user_id", studentIds)
          .gte("created_at", twoWeeksAgo.toISOString())
          .lt("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("problem_attempts")
          .select("is_correct, stem_problems(subject)")
          .in("user_id", studentIds)
          .gte("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("student_assignments")
          .select("completed, grade, content")
          .in("student_id", studentIds)
          .eq("assignment_type", "quiz")
      ]);

      // Calculate engagement change
      const thisWeekCount = thisWeekProgress.data?.length || 0;
      const lastWeekCount = lastWeekProgress.data?.length || 0;
      const engagementChange = lastWeekCount > 0 
        ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100 
        : 0;

      // Calculate completion rate
      const completedAssignments = assignments.data?.filter(a => a.completed).length || 0;
      const avgCompletionRate = assignments.data?.length 
        ? (completedAssignments / assignments.data.length) * 100 
        : 0;

      // Analyze confusing topics from problem attempts
      const topicStats = new Map<string, { correct: number; total: number }>();
      problemAttempts.data?.forEach(attempt => {
        const subject = (attempt as any).stem_problems?.subject || "General";
        const stats = topicStats.get(subject) || { correct: 0, total: 0 };
        stats.total += 1;
        if (attempt.is_correct) stats.correct += 1;
        topicStats.set(subject, stats);
      });

      const confusingTopics = Array.from(topicStats.entries())
        .map(([topic, stats]) => ({
          topic,
          failureRate: stats.total > 0 ? ((stats.total - stats.correct) / stats.total) * 100 : 0,
          attemptCount: stats.total
        }))
        .filter(t => t.attemptCount >= 3) // Only show topics with meaningful data
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, 5);

      const strongTopics = Array.from(topicStats.entries())
        .map(([topic, stats]) => ({
          topic,
          successRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
        }))
        .filter(t => t.successRate >= 70)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 3);

      setAnalytics({
        engagementChange,
        avgCompletionRate,
        confusingTopics,
        strongTopics,
        weeklyActivity: thisWeekCount,
        totalStudents: studentIds.length
      });
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teaching Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading analytics...</p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teaching Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No data available yet. Analytics will appear as students engage with content.</p>
        </CardContent>
      </Card>
    );
  }

  const getEngagementInsight = () => {
    const change = Math.abs(analytics.engagementChange);
    if (analytics.engagementChange > 0) {
      return {
        icon: <TrendingUp className="w-5 h-5 text-secondary" />,
        message: `Your average student engagement increased by ${change.toFixed(0)}% this week!`,
        type: "success" as const
      };
    } else if (analytics.engagementChange < -10) {
      return {
        icon: <TrendingDown className="w-5 h-5 text-destructive" />,
        message: `Student engagement decreased by ${change.toFixed(0)}% this week. Consider mixing up activities or checking in with students.`,
        type: "warning" as const
      };
    }
    return {
      icon: <Target className="w-5 h-5 text-primary" />,
      message: "Student engagement is steady. Keep up the consistent teaching!",
      type: "neutral" as const
    };
  };

  const insight = getEngagementInsight();

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Teaching Analytics Dashboard
        </CardTitle>
        <CardDescription>
          Data-driven insights to help you improve your teaching
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="topics">Topics</TabsTrigger>
            <TabsTrigger value="tips">Tips</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Engagement Insight */}
            <div className={`p-4 rounded-lg border-2 ${
              insight.type === "success" ? "bg-secondary/10 border-secondary" :
              insight.type === "warning" ? "bg-destructive/10 border-destructive" :
              "bg-primary/10 border-primary"
            }`}>
              <div className="flex items-start gap-3">
                {insight.icon}
                <p className="text-sm font-medium flex-1">{insight.message}</p>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Weekly Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{analytics.weeklyActivity}</p>
                  <p className="text-xs text-muted-foreground mt-1">Lesson completions this week</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Avg Completion Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-energy">{analytics.avgCompletionRate.toFixed(0)}%</p>
                  <Progress value={analytics.avgCompletionRate} className="mt-2" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="space-y-4">
            {/* Confusing Topics */}
            {analytics.confusingTopics.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h3 className="font-semibold">Topics Students Find Challenging</h3>
                </div>
                {analytics.confusingTopics.map((topic, idx) => (
                  <Card key={idx} className="bg-destructive/5">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{topic.topic}</p>
                        <Badge variant="destructive">{topic.failureRate.toFixed(0)}% struggle rate</Badge>
                      </div>
                      <Progress value={topic.failureRate} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on {topic.attemptCount} attempts
                      </p>
                    </CardContent>
                  </Card>
                ))}
                <div className="p-3 bg-accent rounded-lg text-sm">
                  <p className="font-medium mb-1">💡 Suggestion:</p>
                  <p className="text-muted-foreground">
                    Consider reviewing {analytics.confusingTopics[0]?.topic} in your next class. 
                    Try breaking it down into smaller concepts or using different examples.
                  </p>
                </div>
              </div>
            )}

            {/* Strong Topics */}
            {analytics.strongTopics.length > 0 && (
              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-secondary" />
                  <h3 className="font-semibold">Topics Students Excel At</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analytics.strongTopics.map((topic, idx) => (
                    <Badge key={idx} variant="outline" className="bg-secondary/10 border-secondary">
                      {topic.topic} ({topic.successRate.toFixed(0)}% success)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tips" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-achievement" />
                <h3 className="font-semibold">Teaching Improvement Tips</h3>
              </div>

              {analytics.avgCompletionRate < 60 && (
                <Card className="bg-accent/50">
                  <CardContent className="pt-4">
                    <p className="font-medium mb-2">📚 Boost Assignment Completion</p>
                    <p className="text-sm text-muted-foreground">
                      Your completion rate is {analytics.avgCompletionRate.toFixed(0)}%. 
                      Try shortening assignments, providing clearer instructions, or offering 
                      bonus points for timely completion.
                    </p>
                  </CardContent>
                </Card>
              )}

              {analytics.engagementChange < -5 && (
                <Card className="bg-accent/50">
                  <CardContent className="pt-4">
                    <p className="font-medium mb-2">🎯 Re-engage Students</p>
                    <p className="text-sm text-muted-foreground">
                      Activity has dropped recently. Consider adding interactive elements like 
                      live check-ins, gamified challenges, or collaborative projects.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-accent/50">
                <CardContent className="pt-4">
                  <p className="font-medium mb-2">🎤 Use Live Lecture Tools</p>
                  <p className="text-sm text-muted-foreground">
                    The live lecture capture feature can automatically generate questions from 
                    your lectures. Try saying "generate question now" during key moments!
                  </p>
                </CardContent>
              </Card>

              {analytics.confusingTopics.length > 0 && (
                <Card className="bg-accent/50">
                  <CardContent className="pt-4">
                    <p className="font-medium mb-2">🔄 Review Challenging Topics</p>
                    <p className="text-sm text-muted-foreground">
                      Students are struggling with {analytics.confusingTopics[0]?.topic}. 
                      Try a different approach: use analogies, real-world examples, or 
                      hands-on practice exercises.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
