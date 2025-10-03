import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, Flame } from "lucide-react";

interface StudentProgressCardProps {
  students: Array<{
    id: string;
    name: string;
    level: number;
    experience_points: number;
    current_streak: number;
    completedLessons: number;
    totalLessons: number;
    averageMasteryAttempts?: number;
  }>;
}

export default function StudentProgressCard({ students }: StudentProgressCardProps) {
  return (
    <Card className="pixel-corners">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Student Progress Overview
        </CardTitle>
        <CardDescription>Track your students' learning journey</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.map((student) => (
          <div key={student.id} className="space-y-2 p-4 bg-accent/20 rounded-lg pixel-corners">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{student.name}</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Target className="w-4 h-4 text-primary" />
                  Level {student.level}
                </span>
                <span className="flex items-center gap-1">
                  <Flame className="w-4 h-4 text-warning" />
                  {student.current_streak} day streak
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Lessons: {student.completedLessons}/{student.totalLessons}</span>
                <span>{Math.round((student.completedLessons / student.totalLessons) * 100)}%</span>
              </div>
              <Progress 
                value={(student.completedLessons / student.totalLessons) * 100} 
                className="h-2"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {student.experience_points} XP earned
              </span>
              {student.averageMasteryAttempts && (
                <span className="text-muted-foreground">
                  Avg mastery: {student.averageMasteryAttempts.toFixed(1)} attempts
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
