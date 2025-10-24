import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface FlaggedStudent {
  student_id: string;
  student_name: string;
  assignment_id: string;
  assignment_title: string;
  typed_count: number;
  pasted_count: number;
  paste_percentage: number;
  flagged_at: string;
}

interface CheatDetectionCardProps {
  instructorId: string;
}

export const CheatDetectionCard = ({ instructorId }: CheatDetectionCardProps) => {
  const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlaggedStudents();

    // Real-time updates
    const channel = supabase
      .channel('cheat-detection-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answer_version_history'
        },
        () => {
          fetchFlaggedStudents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instructorId]);

  const fetchFlaggedStudents = async () => {
    try {
      // Get all students for this instructor
      const { data: studentLinks } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', instructorId);

      if (!studentLinks || studentLinks.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);

      // Get version history with high paste percentage (>40% indicates potential cheating)
      const { data: versionData } = await supabase
        .from('answer_version_history')
        .select(`
          student_id,
          assignment_id,
          typed_count,
          pasted_count,
          created_at,
          student_assignments!inner(
            title,
            instructor_id
          ),
          users!inner(
            name
          )
        `)
        .in('student_id', studentIds)
        .eq('student_assignments.instructor_id', instructorId);

      if (!versionData) {
        setLoading(false);
        return;
      }

      // Filter and format flagged students (>40% paste)
      const flagged = versionData
        .map((record: any) => {
          const total = record.typed_count + record.pasted_count;
          const pastePercentage = total > 0 ? (record.pasted_count / total) * 100 : 0;
          
          return {
            student_id: record.student_id,
            student_name: record.users?.name || 'Unknown',
            assignment_id: record.assignment_id,
            assignment_title: record.student_assignments?.title || 'Unknown Assignment',
            typed_count: record.typed_count,
            pasted_count: record.pasted_count,
            paste_percentage: pastePercentage,
            flagged_at: record.created_at
          };
        })
        .filter((record: FlaggedStudent) => record.paste_percentage > 40)
        .sort((a: FlaggedStudent, b: FlaggedStudent) => 
          new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime()
        );

      setFlaggedStudents(flagged);
    } catch (error) {
      console.error('Error fetching flagged students:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Cheat Detection
          </CardTitle>
          <CardDescription>Loading flagged submissions...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (flaggedStudents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-green-500" />
            Cheat Detection
          </CardTitle>
          <CardDescription>No suspicious activity detected</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All student submissions show normal typing patterns.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Cheat Detection
        </CardTitle>
        <CardDescription>
          {flaggedStudents.length} submission(s) flagged for excessive pasting
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {flaggedStudents.map((student, idx) => (
            <div
              key={`${student.student_id}-${student.assignment_id}-${idx}`}
              className="flex items-start justify-between p-4 rounded-lg border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{student.student_name}</p>
                  <Badge variant="destructive" className="text-xs">
                    {student.paste_percentage.toFixed(0)}% pasted
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {student.assignment_title}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Typed: {student.typed_count} events</span>
                  <span>Pasted: {student.pasted_count} events</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
                  <Clock className="h-3 w-3" />
                  <span>Last cheat attempt on {format(new Date(student.flagged_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
