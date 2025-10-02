import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, BookOpen, Trophy, TrendingUp } from "lucide-react";

interface SchoolProgressCardProps {
  totalStudents: number;
  activeStudents: number;
  totalLessonsCompleted: number;
  totalAchievementsUnlocked: number;
  avgCompletionRate: number;
}

export default function SchoolProgressCard({
  totalStudents,
  activeStudents,
  totalLessonsCompleted,
  totalAchievementsUnlocked,
  avgCompletionRate
}: SchoolProgressCardProps) {
  const activeRate = ((activeStudents / totalStudents) * 100).toFixed(1);
  
  return (
    <Card className="border-2 border-secondary shadow-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-secondary" />
          School-Wide Progress
        </CardTitle>
        <CardDescription>Overall platform adoption and achievement</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Students */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Students
            </span>
            <span className="text-sm text-muted-foreground">
              {activeStudents} / {totalStudents} ({activeRate}%)
            </span>
          </div>
          <Progress value={parseFloat(activeRate)} className="h-2" />
        </div>

        {/* Lessons Completed */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Lessons Completed
            </span>
            <span className="text-sm text-muted-foreground">
              {totalLessonsCompleted} total
            </span>
          </div>
          <Progress value={avgCompletionRate} className="h-2" />
          <span className="text-xs text-muted-foreground mt-1">
            Average {avgCompletionRate.toFixed(1)}% completion rate
          </span>
        </div>

        {/* Achievements */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Achievements Unlocked
            </span>
            <span className="text-sm text-muted-foreground">
              {totalAchievementsUnlocked} total
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {(totalAchievementsUnlocked / totalStudents).toFixed(1)} per student average
          </div>
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t">
          <div className="text-center p-3 bg-primary/10 rounded-lg">
            <div className="text-2xl font-bold text-primary">{totalStudents}</div>
            <div className="text-xs text-muted-foreground">Total Students</div>
          </div>
          <div className="text-center p-3 bg-secondary/10 rounded-lg">
            <div className="text-2xl font-bold text-secondary">{activeRate}%</div>
            <div className="text-xs text-muted-foreground">Active Rate</div>
          </div>
          <div className="text-center p-3 bg-accent/10 rounded-lg">
            <div className="text-2xl font-bold text-accent">
              <TrendingUp className="w-6 h-6 mx-auto" />
            </div>
            <div className="text-xs text-muted-foreground">Growing</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
