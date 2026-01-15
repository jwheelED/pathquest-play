import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, GraduationCap, AlertTriangle, TrendingUp } from "lucide-react";

export interface InstructorPerformance {
  id: string;
  name: string;
  email: string;
  studentCount: number;
  avgClassGrade: number;
  atRiskCount: number;
  activeRate: number;
}

interface InstructorPerformanceCardProps {
  instructors: InstructorPerformance[];
  loading?: boolean;
}

export default function InstructorPerformanceCard({
  instructors,
  loading,
}: InstructorPerformanceCardProps) {
  const getGradeBadge = (grade: number) => {
    if (grade >= 80) {
      return <Badge className="bg-primary/10 text-primary">Excellent</Badge>;
    }
    if (grade >= 70) {
      return <Badge className="bg-secondary/10 text-secondary">Good</Badge>;
    }
    if (grade >= 60) {
      return <Badge className="bg-orange-500/10 text-orange-600">Fair</Badge>;
    }
    return <Badge className="bg-destructive/10 text-destructive">Needs Attention</Badge>;
  };

  const totalStudents = instructors.reduce((acc, i) => acc + i.studentCount, 0);
  const totalAtRisk = instructors.reduce((acc, i) => acc + i.atRiskCount, 0);
  const avgGrade = instructors.length > 0
    ? instructors.reduce((acc, i) => acc + i.avgClassGrade, 0) / instructors.length
    : 0;

  return (
    <Card className="headspace-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <GraduationCap className="w-5 h-5 text-secondary" />
          Instructor Performance
        </CardTitle>
        <CardDescription>Class health by instructor</CardDescription>

        {/* Summary Stats */}
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="stat-pill">
            <Users className="w-4 h-4 text-primary" />
            {instructors.length} Instructors
          </div>
          <div className="stat-pill">
            <GraduationCap className="w-4 h-4 text-secondary" />
            {totalStudents} Students
          </div>
          <div className="stat-pill">
            <TrendingUp className="w-4 h-4 text-primary" />
            {avgGrade.toFixed(1)}% Avg
          </div>
          {totalAtRisk > 0 && (
            <div className="stat-pill bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {totalAtRisk} At-Risk
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">Loading instructor data...</div>
          </div>
        ) : instructors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No instructors connected yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instructor</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Avg Grade</TableHead>
                  <TableHead className="text-right">At-Risk</TableHead>
                  <TableHead className="text-right">Active Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructors.map((instructor) => (
                  <TableRow key={instructor.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{instructor.name}</div>
                        <div className="text-sm text-muted-foreground">{instructor.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{instructor.studentCount}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          instructor.avgClassGrade < 60
                            ? "text-destructive font-semibold"
                            : instructor.avgClassGrade < 70
                            ? "text-orange-500 font-semibold"
                            : "font-semibold"
                        }
                      >
                        {instructor.avgClassGrade.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {instructor.atRiskCount > 0 ? (
                        <span className="text-destructive font-semibold">
                          {instructor.atRiskCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{instructor.activeRate.toFixed(0)}%</TableCell>
                    <TableCell>{getGradeBadge(instructor.avgClassGrade)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
