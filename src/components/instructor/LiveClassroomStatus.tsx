import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface LiveClassroomStatusProps {
  totalStudents: number;
  activeCheckIns: number;
  completedResponses: number;
  averageResponseTime?: number;
}

export const LiveClassroomStatus = ({ 
  totalStudents, 
  activeCheckIns, 
  completedResponses,
  averageResponseTime 
}: LiveClassroomStatusProps) => {
  const completionRate = totalStudents > 0 ? (completedResponses / totalStudents) * 100 : 0;
  
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Live Classroom Status
        </CardTitle>
        <CardDescription>Real-time engagement tracking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Students</span>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {totalStudents}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Check-ins</span>
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {activeCheckIns}
              </Badge>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Responses</span>
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {completedResponses}/{totalStudents}
              </Badge>
            </div>
            
            {averageResponseTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Avg Time</span>
                <Badge variant="outline" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {averageResponseTime}s
                </Badge>
              </div>
            )}
          </div>
        </div>

        {activeCheckIns > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Completion Rate</span>
              <span className="text-muted-foreground">{(completionRate || 0).toFixed(0)}%</span>
            </div>
            <Progress value={completionRate} className="h-2" />
            {completionRate === 100 && (
              <p className="text-xs text-green-600 font-medium">✓ All students have responded!</p>
            )}
          </div>
        )}
        
        {activeCheckIns === 0 && (
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">No active check-ins</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
