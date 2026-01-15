import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Brain, Target, Lightbulb, AlertCircle, Users, BookOpen, CheckCircle, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AnalyticsData {
  engagementChange: number;
  avgCompletionRate: number;
  confusingTopics: Array<{ 
    topic: string; 
    failureRate: number; 
    attemptCount: number;
    avgAttempts: number;
    recentTrend: 'improving' | 'declining' | 'stable';
  }>;
  strongTopics: Array<{ 
    topic: string; 
    successRate: number;
    masteryRate: number;
  }>;
  weeklyActivity: number;
  totalStudents: number;
  activeStudents: number;
  totalProblemsAttempted: number;
  avgResponseTime: number;
  assignmentSubmissionRate: number;
  checkInResponseRate: number;
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

      // Fetch comprehensive analytics data
      const [
        thisWeekProgress, 
        lastWeekProgress, 
        problemAttempts, 
        allProblemAttempts,
        assignments,
        checkIns,
        lessonMastery
      ] = await Promise.all([
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
          .select("is_correct, time_spent_seconds, stem_problems(subject)")
          .in("user_id", studentIds)
          .gte("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("problem_attempts")
          .select("is_correct, created_at, stem_problems(subject)")
          .in("user_id", studentIds),
        supabase
          .from("student_assignments")
          .select("completed, grade, content, assignment_type, student_id, created_at")
          .in("student_id", studentIds),
        supabase
          .from("student_assignments")
          .select("completed, student_id, created_at")
          .in("student_id", studentIds)
          .eq("assignment_type", "lecture_checkin")
          .gte("created_at", oneWeekAgo.toISOString()),
        supabase
          .from("lesson_mastery")
          .select("is_mastered, attempt_count, stem_problems:lesson_id(subject)")
          .in("user_id", studentIds)
      ]);

      // Calculate active students (those who did something this week)
      const activeStudentIds = new Set(thisWeekProgress.data?.map(p => p.user_id) || []);
      problemAttempts.data?.forEach(attempt => {
        activeStudentIds.add((attempt as any).user_id);
      });
      const activeStudents = activeStudentIds.size;

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

      // Calculate total problems attempted this week
      const totalProblemsAttempted = problemAttempts.data?.length || 0;

      // Calculate average response time (in minutes)
      const totalTimeSpent = problemAttempts.data?.reduce((sum, attempt) => {
        return sum + (attempt.time_spent_seconds || 0);
      }, 0) || 0;
      const avgResponseTime = totalProblemsAttempted > 0 
        ? totalTimeSpent / totalProblemsAttempted / 60 
        : 0;

      // Calculate assignment submission rate
      const thisWeekAssignments = assignments.data?.filter(a => {
        const assignmentDate = new Date(a.created_at);
        return assignmentDate >= oneWeekAgo;
      }) || [];
      const assignmentSubmissionRate = thisWeekAssignments.length > 0
        ? (thisWeekAssignments.filter(a => a.completed).length / thisWeekAssignments.length) * 100
        : 0;

      // Calculate check-in response rate
      const totalCheckIns = checkIns.data?.length || 0;
      const expectedCheckInResponses = totalCheckIns > 0 ? totalCheckIns : 1;
      const actualResponses = checkIns.data?.filter(c => c.completed).length || 0;
      const checkInResponseRate = (actualResponses / expectedCheckInResponses) * 100;

      // Analyze topics with trends
      const topicStats = new Map<string, { 
        correct: number; 
        total: number; 
        recentCorrect: number; 
        recentTotal: number;
        attemptsByUser: Map<string, number>;
      }>();
      
      allProblemAttempts.data?.forEach(attempt => {
        const subject = (attempt as any).stem_problems?.subject || "General";
        const stats = topicStats.get(subject) || { 
          correct: 0, 
          total: 0, 
          recentCorrect: 0, 
          recentTotal: 0,
          attemptsByUser: new Map()
        };
        stats.total += 1;
        if (attempt.is_correct) stats.correct += 1;
        
        // Track recent attempts (this week)
        const attemptDate = new Date(attempt.created_at);
        if (attemptDate >= oneWeekAgo) {
          stats.recentTotal += 1;
          if (attempt.is_correct) stats.recentCorrect += 1;
        }
        
        topicStats.set(subject, stats);
      });

      // Calculate average attempts per topic from mastery data
      const topicMasteryAttempts = new Map<string, number[]>();
      lessonMastery.data?.forEach(mastery => {
        const subject = (mastery as any).stem_problems?.subject || "General";
        const attempts = topicMasteryAttempts.get(subject) || [];
        attempts.push(mastery.attempt_count);
        topicMasteryAttempts.set(subject, attempts);
      });

      const confusingTopics = Array.from(topicStats.entries())
        .map(([topic, stats]) => {
          const failureRate = stats.total > 0 ? ((stats.total - stats.correct) / stats.total) * 100 : 0;
          const recentFailureRate = stats.recentTotal > 0 
            ? ((stats.recentTotal - stats.recentCorrect) / stats.recentTotal) * 100 
            : failureRate;
          
          const attempts = topicMasteryAttempts.get(topic) || [];
          const avgAttempts = attempts.length > 0 
            ? attempts.reduce((a, b) => a + b, 0) / attempts.length 
            : 0;
          
          let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
          if (stats.recentTotal >= 3) {
            const diff = failureRate - recentFailureRate;
            if (diff > 10) recentTrend = 'improving';
            else if (diff < -10) recentTrend = 'declining';
          }

          return {
            topic,
            failureRate,
            attemptCount: stats.total,
            avgAttempts: Math.round(avgAttempts * 10) / 10,
            recentTrend
          };
        })
        .filter(t => t.attemptCount >= 3)
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, 5);

      const strongTopics = Array.from(topicStats.entries())
        .map(([topic, stats]) => {
          const successRate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
          const masteryData = lessonMastery.data?.filter(m => 
            (m as any).stem_problems?.subject === topic
          ) || [];
          const masteredCount = masteryData.filter(m => m.is_mastered).length;
          const masteryRate = masteryData.length > 0 
            ? (masteredCount / masteryData.length) * 100 
            : 0;

          return {
            topic,
            successRate,
            masteryRate
          };
        })
        .filter(t => t.successRate >= 70)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 5);

      setAnalytics({
        engagementChange,
        avgCompletionRate,
        confusingTopics,
        strongTopics,
        weeklyActivity: thisWeekCount,
        totalStudents: studentIds.length,
        activeStudents,
        totalProblemsAttempted,
        avgResponseTime,
        assignmentSubmissionRate,
        checkInResponseRate
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
            {/* Direct Engagement Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-primary" />
                    <p className="text-xs text-muted-foreground">Active Students</p>
                  </div>
                  <p className="text-2xl font-bold">{analytics.activeStudents}</p>
                  <p className="text-xs text-muted-foreground">
                    {((analytics.activeStudents / analytics.totalStudents) * 100).toFixed(0)}% of class
                  </p>
                </CardContent>
              </Card>

              <Card className="border-secondary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-secondary" />
                    <p className="text-xs text-muted-foreground">Problems Attempted</p>
                  </div>
                  <p className="text-2xl font-bold">{analytics.totalProblemsAttempted}</p>
                  <p className="text-xs text-muted-foreground">
                    This week
                  </p>
                </CardContent>
              </Card>

              <Card className="border-accent/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <p className="text-xs text-muted-foreground">Assignment Rate</p>
                  </div>
                  <p className="text-2xl font-bold">{analytics.assignmentSubmissionRate.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted on time
                  </p>
                </CardContent>
              </Card>

              <Card className="border-achievement/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-achievement" />
                    <p className="text-xs text-muted-foreground">Avg Response Time</p>
                  </div>
                  <p className="text-2xl font-bold">{analytics.avgResponseTime.toFixed(1)}m</p>
                  <p className="text-xs text-muted-foreground">
                    Per problem
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Engagement Trend Insight */}
            <div className={`p-4 rounded-lg border-2 ${
              insight.type === "success" ? "bg-secondary/10 border-secondary" :
              insight.type === "warning" ? "bg-destructive/10 border-destructive" :
              "bg-primary/10 border-primary"
            }`}>
              <div className="flex items-start gap-3">
                {insight.icon}
                <div className="flex-1">
                  <p className="text-sm font-medium">{insight.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Week-over-week: {analytics.engagementChange > 0 ? '+' : ''}{analytics.engagementChange.toFixed(1)}% change in activity
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Overall Completion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">All Assignments</span>
                      <span className="text-sm font-bold">{analytics.avgCompletionRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={analytics.avgCompletionRate} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">Check-In Responses</span>
                      <span className="text-sm font-bold">{analytics.checkInResponseRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={analytics.checkInResponseRate} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-secondary" />
                    Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Lesson Completions</span>
                    <span className="text-sm font-medium">{analytics.weeklyActivity}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Problem Attempts</span>
                    <span className="text-sm font-medium">{analytics.totalProblemsAttempted}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Active Learners</span>
                    <span className="text-sm font-medium">{analytics.activeStudents}/{analytics.totalStudents}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Avg Time/Problem</span>
                    <span className="text-sm font-medium">{analytics.avgResponseTime.toFixed(1)} min</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="space-y-4">
            {/* Confusing Topics - Enhanced */}
            {analytics.confusingTopics.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h3 className="font-semibold">Topics Students Find Challenging</h3>
                </div>
                {analytics.confusingTopics.map((topic, idx) => (
                  <Card key={idx} className="bg-destructive/5 border-destructive/20">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-lg">{topic.topic}</p>
                            {topic.recentTrend === 'improving' && (
                              <Badge variant="outline" className="bg-secondary/20 border-secondary text-secondary">
                                Improving ↗
                              </Badge>
                            )}
                            {topic.recentTrend === 'declining' && (
                              <Badge variant="outline" className="bg-destructive/20 border-destructive text-destructive">
                                Declining ↘
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Rank #{idx + 1} most challenging
                          </p>
                        </div>
                        <Badge variant="destructive" className="text-lg px-3 py-1">
                          {topic.failureRate.toFixed(0)}%
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Struggle Rate</span>
                          <span className="font-medium">{topic.failureRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={topic.failureRate} className="h-2" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Attempts</p>
                          <p className="text-lg font-semibold">{topic.attemptCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Avg to Master</p>
                          <p className="text-lg font-semibold">
                            {topic.avgAttempts > 0 ? `${topic.avgAttempts} tries` : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="p-4 bg-accent/50 rounded-lg border border-accent">
                  <p className="font-medium mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Teaching Recommendation
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{analytics.confusingTopics[0]?.topic}</span> needs attention. 
                    Students are taking an average of <span className="font-medium">
                    {analytics.confusingTopics[0]?.avgAttempts} attempts</span> to master this topic.
                    Consider: breaking concepts into smaller steps, providing more examples, or scheduling 
                    a review session.
                  </p>
                </div>
              </div>
            )}

            {/* Strong Topics - Enhanced */}
            {analytics.strongTopics.length > 0 && (
              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-secondary" />
                  <h3 className="font-semibold">Topics Students Excel At</h3>
                </div>
                <div className="grid gap-3">
                  {analytics.strongTopics.map((topic, idx) => (
                    <Card key={idx} className="bg-secondary/5 border-secondary/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-secondary/20 border-secondary text-lg px-2">
                              #{idx + 1}
                            </Badge>
                            <p className="font-medium text-lg">{topic.topic}</p>
                          </div>
                          <Badge className="bg-secondary text-lg px-3 py-1">
                            {topic.successRate.toFixed(0)}%
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
                            <Progress value={topic.successRate} className="h-2" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Mastery Rate</p>
                            <Progress value={topic.masteryRate} className="h-2" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="p-4 bg-secondary/10 rounded-lg border border-secondary/20">
                  <p className="font-medium mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Success Insight
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your teaching methods for <span className="font-medium">
                    {analytics.strongTopics[0]?.topic}</span> are highly effective! 
                    Consider using similar approaches for challenging topics.
                  </p>
                </div>
              </div>
            )}

            {/* No data states */}
            {analytics.confusingTopics.length === 0 && analytics.strongTopics.length === 0 && (
              <div className="text-center py-8">
                <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Not enough topic data yet. Analytics will appear as students complete more practice problems.
                </p>
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
