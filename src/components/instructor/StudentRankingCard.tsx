import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Medal, Trophy, Award, RefreshCw, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface StudentRankingCardProps {
  students: Array<{
    id: string;
    name: string;
    average_grade?: number;
    rank: number;
  }>;
  onStudentClick: (studentId: string) => void;
  onRefresh?: () => Promise<void>;
}

export default function StudentRankingCard({ students, onStudentClick, onRefresh }: StudentRankingCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="w-5 h-5 text-warning" />;
      case 2: return <Medal className="w-5 h-5 text-muted-foreground" />;
      case 3: return <Award className="w-5 h-5 text-amber-600" />;
      default: return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold">#{rank}</span>;
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  return (
    <Card className="pixel-corners">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Student Rankings
            </CardTitle>
            <CardDescription>Ranked by overall check-in quiz performance</CardDescription>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {students.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No students have joined yet
            </p>
          </div>
        ) : (
          students.map((student) => (
          <div
            key={student.id}
            onClick={() => onStudentClick(student.id)}
            className="flex items-center gap-3 p-3 bg-accent/20 rounded-lg pixel-corners hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-center w-8">
              {getRankIcon(student.rank)}
            </div>
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {student.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold">{student.name}</h3>
              <p className="text-sm text-muted-foreground">
                {student.average_grade !== undefined 
                  ? `Average Grade: ${student.average_grade.toFixed(1)}%` 
                  : 'No grades yet'}
              </p>
            </div>
          </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
