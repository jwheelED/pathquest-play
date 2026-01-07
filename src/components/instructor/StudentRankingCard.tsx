import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";

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

  // Sort students alphabetically by name
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  return (
    <Card className="pixel-corners overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">Students</span>
            </CardTitle>
            <CardDescription className="truncate">Alphabetical list of enrolled students</CardDescription>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedStudents.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No students have joined yet
            </p>
          </div>
        ) : (
          sortedStudents.map((student) => (
          <div
            key={student.id}
            onClick={() => onStudentClick(student.id)}
            className="flex items-center gap-3 p-3 bg-accent/20 rounded-lg pixel-corners hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {student.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{student.name}</h3>
              <p className="text-sm text-muted-foreground truncate">
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
