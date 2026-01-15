import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StrugglingStudentsCardProps {
  students: Array<{
    id: string;
    name: string;
    issue: string;
    severity: "high" | "medium" | "low";
    lastActive: string;
  }>;
  onMessageStudent: (studentId: string) => void;
}

export default function StrugglingStudentsCard({ students, onMessageStudent }: StrugglingStudentsCardProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "default";
    }
  };

  return (
    <Card className="pixel-corners border-warning/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Students Needing Help
        </CardTitle>
        <CardDescription>Students who may need additional support</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {students.length === 0 ? (
          <p className="text-muted-foreground text-sm">All students are doing well! 🎉</p>
        ) : (
          students.map((student) => (
            <div key={student.id} className="flex items-start justify-between p-3 bg-accent/20 rounded-lg pixel-corners">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{student.name}</h3>
                  <Badge variant={getSeverityColor(student.severity)}>
                    {student.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{student.issue}</p>
                <p className="text-xs text-muted-foreground">Last active: {student.lastActive}</p>
              </div>
              <Button
                size="sm"
                variant="retro"
                onClick={() => onMessageStudent(student.id)}
                className="ml-2"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
