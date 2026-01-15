import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, Flame, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface StudentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    name: string;
    level: number;
    experience_points: number;
    current_streak: number;
    completedLessons: number;
    totalLessons: number;
    problemAttempts: Array<{
      problem_text: string;
      is_correct: boolean;
      time_spent_seconds: number;
      created_at: string;
    }>;
    recentActivity: Array<{
      type: string;
      description: string;
      date: string;
    }>;
  } | null;
}

export default function StudentDetailDialog({ open, onOpenChange, student }: StudentDetailDialogProps) {
  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto pixel-corners">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {student.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-2xl">{student.name}</DialogTitle>
              <DialogDescription>Detailed student progress and statistics</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 my-4">
          <Card className="pixel-corners">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{student.level}</p>
            </CardContent>
          </Card>
          <Card className="pixel-corners">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning" />
                Total XP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-warning">{student.experience_points}</p>
            </CardContent>
          </Card>
          <Card className="pixel-corners">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-destructive" />
                Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{student.current_streak} days</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="progress" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="attempts">Problem Attempts</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="space-y-4">
            <Card className="pixel-corners">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Lesson Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Completed: {student.completedLessons}/{student.totalLessons}</span>
                    <span className="font-semibold">
                      {Math.round((student.completedLessons / student.totalLessons) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={(student.completedLessons / student.totalLessons) * 100}
                    className="h-3"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attempts" className="space-y-3">
            {student.problemAttempts.map((attempt, idx) => (
              <Card key={idx} className="pixel-corners">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    {attempt.is_correct ? (
                      <CheckCircle2 className="w-5 h-5 text-success mt-1" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive mt-1" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{attempt.problem_text}</p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Time: {Math.floor(attempt.time_spent_seconds / 60)}m {attempt.time_spent_seconds % 60}s</span>
                        <span>{new Date(attempt.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            {student.recentActivity.map((activity, idx) => (
              <Card key={idx} className="pixel-corners">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">{activity.type}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.date).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
