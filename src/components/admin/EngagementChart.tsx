import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Activity } from "lucide-react";

interface EngagementChartProps {
  data: Array<{
    week: string;
    students: number;
    problems: number;
    lessons: number;
  }>;
}

export default function EngagementChart({ data }: EngagementChartProps) {
  return (
    <Card className="border-2 border-primary shadow-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Engagement Metrics
        </CardTitle>
        <CardDescription>Weekly activity across the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))' 
              }} 
            />
            <Legend />
            <Bar dataKey="students" fill="hsl(var(--primary))" name="Active Students" />
            <Bar dataKey="problems" fill="hsl(var(--secondary))" name="Problems Solved" />
            <Bar dataKey="lessons" fill="hsl(var(--accent))" name="Lessons Completed" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
