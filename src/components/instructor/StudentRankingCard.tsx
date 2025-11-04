import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Medal, Trophy, Award } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface StudentRankingCardProps {
  students: Array<{
    id: string;
    name: string;
    average_grade?: number;
    rank: number;
  }>;
  onStudentClick: (studentId: string) => void;
}

export default function StudentRankingCard({ students, onStudentClick }: StudentRankingCardProps) {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="w-5 h-5 text-warning" />;
      case 2: return <Medal className="w-5 h-5 text-muted-foreground" />;
      case 3: return <Award className="w-5 h-5 text-amber-600" />;
      default: return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold">#{rank}</span>;
    }
  };

  return (
    <Card className="pixel-corners">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Student Rankings
        </CardTitle>
        <CardDescription>Ranked by overall check-in quiz performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {students.map((student) => (
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
        ))}
      </CardContent>
    </Card>
  );
}
