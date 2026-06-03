import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Download, Search, TrendingDown, Clock, BookOpen, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface AtRiskStudent {
  id: string;
  name: string;
  email: string;
  instructorName: string;
  avgGrade: number;
  lastActive: string;
  incompleteAssignments: number;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium";
  riskFactors: string[];
}

interface AtRiskStudentsTableProps {
  students: AtRiskStudent[];
  loading?: boolean;
}

export function calculateRiskScore(
  avgGrade: number,
  daysSinceActive: number,
  incompleteAssignments: number,
  streakBroken: boolean = false,
  weakConcepts: number = 0,
): { score: number; level: "critical" | "high" | "medium"; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // Grade < 60% = +3 risk points
  if (avgGrade < 60) {
    score += 3;
    factors.push("Low grades (<60%)");
  } else if (avgGrade < 70) {
    score += 2;
    factors.push("Below average grades");
  }

  // No activity in 7+ days = +2 risk points
  if (daysSinceActive >= 7) {
    score += 2;
    factors.push("Inactive 7+ days");
  } else if (daysSinceActive >= 3) {
    score += 1;
    factors.push("Recent inactivity");
  }

  // Streak broken = +1 risk point
  if (streakBroken) {
    score += 1;
    factors.push("Broken streak");
  }

  // Multiple weak concepts = +2 risk points
  if (weakConcepts >= 3) {
    score += 2;
    factors.push("Multiple weak concepts");
  } else if (weakConcepts >= 1) {
    score += 1;
    factors.push("Some weak concepts");
  }

  // Incomplete assignments
  if (incompleteAssignments >= 3) {
    score += 2;
    factors.push("Many incomplete assignments");
  } else if (incompleteAssignments >= 1) {
    score += 1;
    factors.push("Incomplete assignments");
  }

  let level: "critical" | "high" | "medium" = "medium";
  if (score >= 6) {
    level = "critical";
  } else if (score >= 4) {
    level = "high";
  }

  return { score, level, factors };
}

export default function AtRiskStudentsTable({ students, loading }: AtRiskStudentsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.instructorName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRisk = riskFilter === "all" || student.riskLevel === riskFilter;

    return matchesSearch && matchesRisk;
  });

  const handleExport = () => {
    const csvContent = [
      ["Name", "Email", "Instructor", "Avg Grade", "Last Active", "Incomplete", "Risk Level", "Risk Score"].join(","),
      ...filteredStudents.map((s) =>
        [
          s.name,
          s.email,
          s.instructorName,
          s.avgGrade,
          s.lastActive,
          s.incompleteAssignments,
          s.riskLevel,
          s.riskScore,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `at-risk-students-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("At-risk students list exported");
  };

  const getRiskBadge = (level: "critical" | "high" | "medium") => {
    switch (level) {
      case "critical":
        return <Badge className="bg-destructive text-destructive-foreground">Critical</Badge>;
      case "high":
        return <Badge className="bg-orange-500 text-white">High</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500 text-yellow-950">Medium</Badge>;
    }
  };

  const criticalCount = students.filter((s) => s.riskLevel === "critical").length;
  const highCount = students.filter((s) => s.riskLevel === "high").length;
  const mediumCount = students.filter((s) => s.riskLevel === "medium").length;

  return (
    <Card className="headspace-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              At-Risk Students
            </CardTitle>
            <CardDescription className="mt-1">Students who may need help</CardDescription>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export List
          </Button>
        </div>

        {/* Risk Summary Pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="stat-pill bg-destructive/10 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            {criticalCount} Critical
          </div>
          <div className="stat-pill bg-orange-500/10 text-orange-600">
            <TrendingDown className="w-4 h-4" />
            {highCount} High Risk
          </div>
          <div className="stat-pill bg-yellow-500/10 text-yellow-600">
            <Clock className="w-4 h-4" />
            {mediumCount} Medium Risk
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or instructor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading at-risk students...</div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {students.length === 0
                ? "No at-risk students identified - great job!"
                : "No students match your search criteria"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead className="text-right">Avg Grade</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Incomplete</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Risk Factors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{student.name}</div>
                        <div className="text-sm text-muted-foreground">{student.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{student.instructorName}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          student.avgGrade < 60
                            ? "text-destructive font-semibold"
                            : student.avgGrade < 70
                              ? "text-orange-500 font-semibold"
                              : ""
                        }
                      >
                        {student.avgGrade.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{student.lastActive}</TableCell>
                    <TableCell className="text-right">{student.incompleteAssignments}</TableCell>
                    <TableCell>{getRiskBadge(student.riskLevel)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {student.riskFactors.slice(0, 2).map((factor, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {factor}
                          </Badge>
                        ))}
                        {student.riskFactors.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{student.riskFactors.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
