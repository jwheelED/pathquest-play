import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Copy } from "lucide-react";
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
  pattern_type: string;
  suspicion_level: 'HIGH' | 'MEDIUM' | 'LOW';
  time_to_first_interaction?: number | null;
  first_interaction_type?: string | null;
  question_copied?: boolean;
  tab_switch_count: number;
  total_time_away_seconds: number;
  longest_absence_seconds: number;
  switched_away_immediately: boolean;
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

      // Get version history with enhanced tracking fields
      const { data: versionData } = await supabase
        .from('answer_version_history')
        .select(`
          student_id,
          assignment_id,
          typed_count,
          pasted_count,
          created_at,
          question_displayed_at,
          first_interaction_at,
          first_interaction_type,
          first_interaction_size,
          question_copied,
          question_copied_at,
          final_answer_length,
          editing_events_after_first_paste,
          tab_switch_count,
          total_time_away_seconds,
          tab_switches,
          longest_absence_seconds,
          switched_away_immediately,
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

      // Filter for unusual pasting patterns with enhanced detection
      const flagged = versionData
        .map((record: any) => {
          const total = record.typed_count + record.pasted_count;
          const pastePercentage = total > 0 ? (record.pasted_count / total) * 100 : 0;
          
          // Calculate time to first interaction (in seconds)
          let timeToFirstInteraction: number | null = null;
          if (record.question_displayed_at && record.first_interaction_at) {
            const displayTime = new Date(record.question_displayed_at).getTime();
            const interactionTime = new Date(record.first_interaction_at).getTime();
            timeToFirstInteraction = Math.floor((interactionTime - displayTime) / 1000);
          }

          // Parse tab switches for analysis
          const tabSwitches = (record.tab_switches || []) as Array<{
            left_at: string;
            returned_at: string;
            duration_seconds: number;
          }>;
          
          // Determine suspicion level and pattern type
          let suspicionLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
          let patternType = '';
          
          // HIGH SUSPICION: Switch-Paste Pattern (left for ChatGPT time, returned, pasted)
          if (
            tabSwitches.length > 0 &&
            record.pasted_count >= 1 &&
            record.first_interaction_type === 'pasted'
          ) {
            const lastSwitch = tabSwitches[tabSwitches.length - 1];
            if (
              lastSwitch.duration_seconds >= 30 &&
              lastSwitch.duration_seconds <= 300 &&
              record.first_interaction_at
            ) {
              const timeSinceReturn = Math.round(
                (new Date(record.first_interaction_at).getTime() -
                  new Date(lastSwitch.returned_at).getTime()) /
                  1000
              );
              if (timeSinceReturn <= 10) {
                suspicionLevel = 'HIGH';
                patternType = 'Left tab for ChatGPT workflow, returned and pasted';
              }
            }
          }
          
          // HIGH SUSPICION: Immediate Switch + Single Paste
          if (
            suspicionLevel !== 'HIGH' &&
            record.switched_away_immediately &&
            record.pasted_count === 1 &&
            (record.first_interaction_size || 0) > 50
          ) {
            suspicionLevel = 'HIGH';
            patternType = 'Switched away immediately, returned with answer';
          }
          
          // HIGH SUSPICION: Multiple Extended Absences + Paste
          if (
            suspicionLevel !== 'HIGH' &&
            tabSwitches.filter((ts: any) => ts.duration_seconds > 30).length >= 2 &&
            record.pasted_count >= 1
          ) {
            suspicionLevel = 'HIGH';
            patternType = 'Multiple extended absences with paste activity';
          }
          
          // HIGH SUSPICION: Complete answer in single paste
          if (
            suspicionLevel !== 'HIGH' &&
            total <= 3 &&
            record.first_interaction_type === 'pasted' &&
            (record.first_interaction_size || 0) > 50 &&
            timeToFirstInteraction !== null &&
            timeToFirstInteraction >= 30 &&
            timeToFirstInteraction <= 300 &&
            (record.final_answer_length || 0) > 0 &&
            ((record.first_interaction_size || 0) / (record.final_answer_length || 1)) > 0.8
          ) {
            suspicionLevel = 'HIGH';
            patternType = 'Complete answer pasted in single event';
          }
          
          // HIGH SUSPICION: Question copied then quick paste
          if (
            suspicionLevel !== 'HIGH' &&
            record.question_copied &&
            record.pasted_count === 1 &&
            timeToFirstInteraction !== null &&
            timeToFirstInteraction < 120 &&
            record.editing_events_after_first_paste < 5
          ) {
            suspicionLevel = 'HIGH';
            patternType = 'Question copied, then quick paste';
          }
          
          // MEDIUM SUSPICION: Frequent Switching
          if (suspicionLevel === 'LOW' && (record.tab_switch_count || 0) >= 5) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Frequent tab switching during question';
          }
          
          // MEDIUM SUSPICION: Majority Time Away
          if (
            suspicionLevel === 'LOW' &&
            timeToFirstInteraction !== null &&
            (record.total_time_away_seconds || 0) > timeToFirstInteraction * 0.5
          ) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Spent majority of time away from tab';
          }
          
          // MEDIUM SUSPICION: Long Absence Pattern
          if (
            suspicionLevel === 'LOW' &&
            (record.longest_absence_seconds || 0) > 120 &&
            record.pasted_count >= 1
          ) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Long absence followed by paste';
          }
          
          // MEDIUM SUSPICION: Minimal interaction for answer length
          if (
            suspicionLevel === 'LOW' &&
            (record.final_answer_length || 0) > 300 &&
            total <= 5 &&
            record.pasted_count >= 1
          ) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Minimal interaction for answer length';
          }
          
          // Existing detection: Multiple paste patterns
          if (suspicionLevel === 'LOW' && pastePercentage > 70 && total >= 5) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Extremely high paste percentage';
          } else if (suspicionLevel === 'LOW' && pastePercentage > 60 && record.pasted_count > 5) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Repeated copying pattern';
          } else if (suspicionLevel === 'LOW' && record.pasted_count > 10 && pastePercentage > 55) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Excessive paste operations';
          }
          
          return {
            student_id: record.student_id,
            student_name: record.users?.name || 'Unknown',
            assignment_id: record.assignment_id,
            assignment_title: record.student_assignments?.title || 'Unknown Assignment',
            typed_count: record.typed_count,
            pasted_count: record.pasted_count,
            paste_percentage: pastePercentage,
            flagged_at: record.created_at,
            pattern_type: patternType,
            suspicion_level: suspicionLevel,
            time_to_first_interaction: timeToFirstInteraction,
            first_interaction_type: record.first_interaction_type,
            question_copied: record.question_copied || false,
            tab_switch_count: record.tab_switch_count || 0,
            total_time_away_seconds: record.total_time_away_seconds || 0,
            longest_absence_seconds: record.longest_absence_seconds || 0,
            switched_away_immediately: record.switched_away_immediately || false
          };
        })
        .filter((record: FlaggedStudent) => {
          // Flag if any suspicion level is detected
          return record.suspicion_level !== 'LOW';
        })
        .sort((a: FlaggedStudent, b: FlaggedStudent) => {
          // Sort by suspicion level first, then by time
          if (a.suspicion_level !== b.suspicion_level) {
            return a.suspicion_level === 'HIGH' ? -1 : 1;
          }
          return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
        });

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
          {flaggedStudents.length} submission(s) flagged for unusual pasting patterns
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
                  <Badge 
                    variant={student.suspicion_level === 'HIGH' ? 'destructive' : 'secondary'} 
                    className="text-xs"
                  >
                    {student.suspicion_level} SUSPICION
                  </Badge>
                  {student.paste_percentage > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {student.paste_percentage.toFixed(0)}% pasted
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {student.assignment_title}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Typed: {student.typed_count} events</span>
                  <span>Pasted: {student.pasted_count} events</span>
                  {student.time_to_first_interaction !== null && (
                    <span>Time to answer: {student.time_to_first_interaction}s</span>
                  )}
                </div>
                {student.question_copied && (
                  <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Question was copied</span>
                  </div>
                )}
                {student.first_interaction_type === 'pasted' && (
                  <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>First action was paste</span>
                  </div>
                )}
                {student.tab_switch_count > 0 && (
                  <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>
                      Switched tabs {student.tab_switch_count} time{student.tab_switch_count > 1 ? 's' : ''} ({Math.round(student.total_time_away_seconds)}s total
                      {student.longest_absence_seconds > 30 ? `, longest: ${Math.round(student.longest_absence_seconds)}s` : ''})
                    </span>
                  </div>
                )}
                {student.switched_away_immediately && (
                  <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Switched away immediately after seeing question</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400">
                  <Clock className="h-3 w-3" />
                  <span>Flagged on {format(new Date(student.flagged_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mt-1">
                  ⚠️ {student.pattern_type}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
