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
  answer_copied?: boolean;
  answer_copy_count?: number;
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
          answer_copied,
          answer_copy_count,
          answer_copy_events,
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

          // Debug logging for cases that should be flagged
          if (pastePercentage > 3) {
            console.log(`📊 Student ${record.users?.name}: ${pastePercentage.toFixed(1)}% pasted (${(100-pastePercentage).toFixed(1)}% original), typed: ${record.typed_count}, pasted: ${record.pasted_count}, total: ${total}`);
          }
          
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

          // SIMPLE THRESHOLD: Flag anything less than 97% original work
          // This catches cases where students paste entire answers regardless of event count
          if (pastePercentage > 3 && record.pasted_count >= 1) {
            if (pastePercentage > 50) {
              // More than 50% pasted = HIGH suspicion (less than 50% original work)
              suspicionLevel = 'HIGH';
              patternType = `${pastePercentage.toFixed(0)}% pasted (${(100 - pastePercentage).toFixed(0)}% original work) - High lack of original work`;
            } else if (pastePercentage > 20) {
              // 20-50% pasted = MEDIUM suspicion (50-80% original work)
              suspicionLevel = 'MEDIUM';
              patternType = `${pastePercentage.toFixed(0)}% pasted (${(100 - pastePercentage).toFixed(0)}% original work) - Moderate lack of original work`;
            } else if (pastePercentage > 3) {
              // 3-20% pasted = MEDIUM suspicion (80-97% original work)
              suspicionLevel = 'MEDIUM';
              patternType = `${pastePercentage.toFixed(0)}% pasted (${(100 - pastePercentage).toFixed(0)}% original work) - Below originality threshold`;
            }
          }
          
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
          
          // HIGH SUSPICION: Copied from answer box multiple times, then pasted
          if (
            suspicionLevel !== 'HIGH' &&
            (record.answer_copy_count || 0) >= 2 &&
            record.pasted_count >= 1
          ) {
            suspicionLevel = 'HIGH';
            patternType = 'Copied from answer box multiple times, then pasted';
          }
          
          // MEDIUM SUSPICION: Single answer copy event
          if (
            suspicionLevel === 'LOW' &&
            (record.answer_copy_count || 0) >= 1
          ) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Copied text from answer box';
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
          
          // LEGACY: Multiple paste patterns (now covered by simple threshold above)
          // Kept for backward compatibility but will rarely trigger due to early paste % check
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
            switched_away_immediately: record.switched_away_immediately || false,
            answer_copied: record.answer_copied || false,
            answer_copy_count: record.answer_copy_count || 0,
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

  const highSuspicionCount = flaggedStudents.filter(s => s.suspicion_level === 'HIGH').length;
  const mediumSuspicionCount = flaggedStudents.filter(s => s.suspicion_level === 'MEDIUM').length;

  return (
    <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          Cheat Detection - Original Work Warning
        </CardTitle>
        <CardDescription>
          <div className="space-y-1 mt-2">
            <p className="text-foreground font-medium">
              {flaggedStudents.length} submission(s) flagged for lack of original work
            </p>
            <div className="flex gap-3 text-sm">
              {highSuspicionCount > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  🚨 {highSuspicionCount} HIGH risk (likely copied from AI/external source)
                </span>
              )}
              {mediumSuspicionCount > 0 && (
                <span className="text-orange-600 dark:text-orange-400">
                  ⚠️ {mediumSuspicionCount} MEDIUM risk (unusual patterns)
                </span>
              )}
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 rounded-lg">
          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200 mb-2">
            ⚠️ How to identify lack of original work:
          </p>
          <ul className="text-xs text-yellow-800 dark:text-yellow-300 space-y-1 ml-4 list-disc">
            <li><strong>HIGH risk:</strong> Student switched to another tab (likely ChatGPT/AI), returned and immediately pasted answer</li>
            <li><strong>HIGH risk:</strong> Complete answer pasted in one action with minimal typing</li>
            <li><strong>HIGH risk:</strong> Question copied, then quick paste response (copy-paste to AI)</li>
            <li><strong>MEDIUM risk:</strong> Frequent tab switching or majority of time spent away from the question</li>
            <li><strong>MEDIUM risk:</strong> Long absence followed by paste, or minimal interaction for answer length</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          {flaggedStudents.map((student, idx) => (
            <div
              key={`${student.student_id}-${student.assignment_id}-${idx}`}
              className={`flex items-start justify-between p-4 rounded-lg border ${
                student.suspicion_level === 'HIGH' 
                  ? 'border-red-300 bg-red-50/70 dark:bg-red-950/30 dark:border-red-800' 
                  : 'border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800'
              }`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{student.student_name}</p>
                  <Badge 
                    variant={student.suspicion_level === 'HIGH' ? 'destructive' : 'secondary'} 
                    className={`text-xs font-bold ${
                      student.suspicion_level === 'HIGH' 
                        ? 'bg-red-600 text-white' 
                        : ''
                    }`}
                  >
                    {student.suspicion_level === 'HIGH' ? '🚨 HIGH RISK' : '⚠️ MEDIUM RISK'} - Likely No Original Work
                  </Badge>
                  {student.paste_percentage > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {student.paste_percentage.toFixed(0)}% pasted
                    </Badge>
                  )}
                  {student.typed_count === 0 && (
                    <Badge variant="destructive" className="text-xs">
                      0 typing events
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
                {student.answer_copy_count && student.answer_copy_count > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                    <Copy className="h-3 w-3" />
                    <span>Copied from answer box {student.answer_copy_count} time{student.answer_copy_count > 1 ? 's' : ''}</span>
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
                <div className={`p-2 mt-2 rounded border ${
                  student.suspicion_level === 'HIGH'
                    ? 'bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-800'
                    : 'bg-orange-100 dark:bg-orange-950/50 border-orange-300 dark:border-orange-800'
                }`}>
                  <p className={`text-xs font-bold ${
                    student.suspicion_level === 'HIGH'
                      ? 'text-red-800 dark:text-red-300'
                      : 'text-orange-800 dark:text-orange-300'
                  }`}>
                    {student.suspicion_level === 'HIGH' ? '🚨 Evidence: ' : '⚠️ Pattern: '}{student.pattern_type}
                  </p>
                  <p className={`text-xs mt-1 ${
                    student.suspicion_level === 'HIGH'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-orange-700 dark:text-orange-400'
                  }`}>
                    This indicates the student {student.suspicion_level === 'HIGH' ? 'likely' : 'may have'} used an external source (AI, internet) instead of original work.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
