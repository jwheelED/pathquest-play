import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface AcademicIntegrityInsightsProps {
  instructorId: string;
}

export const AcademicIntegrityInsights = ({ instructorId }: AcademicIntegrityInsightsProps) => {
  const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchFlaggedStudents();

    // Real-time updates
    const channel = supabase
      .channel('integrity-updates')
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
    console.log('🔍 [AcademicIntegrity] Fetching flagged students for instructor:', instructorId);
    try {
      // Get all students for this instructor
      const { data: studentLinks, error: studentLinksError } = await supabase
        .from('instructor_students')
        .select('student_id')
        .eq('instructor_id', instructorId);

      console.log('🔍 [AcademicIntegrity] Student links:', { count: studentLinks?.length, error: studentLinksError });

      if (!studentLinks || studentLinks.length === 0) {
        console.log('🔍 [AcademicIntegrity] No students found');
        setLoading(false);
        return;
      }

      const studentIds = studentLinks.map(link => link.student_id);
      console.log('🔍 [AcademicIntegrity] Student IDs:', studentIds);

      // Get version history with enhanced tracking fields
      const { data: versionData, error: versionError } = await supabase
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
          )
        `)
        .in('student_id', studentIds)
        .eq('student_assignments.instructor_id', instructorId)
        .order('created_at', { ascending: false });

      console.log('🔍 [AcademicIntegrity] Version data:', { count: versionData?.length, error: versionError });

      if (versionError) {
        console.error('Error fetching version history:', versionError);
        setLoading(false);
        return;
      }

      if (!versionData || versionData.length === 0) {
        console.log('🔍 [AcademicIntegrity] No version data found');
        setLoading(false);
        return;
      }

      // Get student names
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', studentIds);

      console.log('🔍 [AcademicIntegrity] Users data:', { count: usersData?.length, error: usersError });

      if (usersError) {
        console.error('Error fetching user names:', usersError);
      }

      const studentNameMap = new Map(
        usersData?.map(user => [user.id, user.name || 'Unknown']) || []
      );

      // Process and flag suspicious patterns
      const flagged: FlaggedStudent[] = [];

      for (const record of versionData) {
        const total = (record.typed_count || 0) + (record.pasted_count || 0);
        const pastePercentage = total > 0 
          ? ((record.pasted_count || 0) / total) * 100 
          : 0;

        console.log('🔍 [AcademicIntegrity] Processing record:', {
          student_id: record.student_id,
          typed: record.typed_count,
          pasted: record.pasted_count,
          pastePercentage,
          tabSwitches: record.tab_switch_count,
          timeAway: record.total_time_away_seconds
        });

        let suspicionLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        let patternType = 'Normal behavior';
        
        // Calculate time to first interaction if available
        let timeToFirstInteraction = null;
        if (record.question_displayed_at && record.first_interaction_at) {
          timeToFirstInteraction = Math.round(
            (new Date(record.first_interaction_at).getTime() - 
             new Date(record.question_displayed_at).getTime()) / 1000
          );
        }

        const tabSwitches = (record.tab_switches as any[]) || [];

        // Multiple Choice Questions (no typing expected, analyze switching behavior)
        if (record.typed_count === 0 && record.pasted_count === 0) {
          console.log('🔍 [AcademicIntegrity] Multiple choice question detected');
          // For multiple choice, only flag if there's excessive tab switching
          if ((record.tab_switch_count || 0) >= 5) {
            suspicionLevel = 'HIGH';
            patternType = 'Multiple choice - Excessive tab switching (5+ times)';
          } else if ((record.tab_switch_count || 0) >= 3) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Multiple choice - Moderate tab switching (3-4 times)';
          } else if ((record.tab_switch_count || 0) >= 1) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Multiple choice - Switched tabs during question';
          } else if (record.question_copied) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Multiple choice - Copied question text';
          } else if (record.first_interaction_type === 'pasted') {
            suspicionLevel = 'MEDIUM';
            patternType = 'First interaction was paste (detailed tracking incomplete)';
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
              patternType = 'Left tab, returned and pasted immediately';
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
          record.answer_copy_count &&
          record.answer_copy_count >= 2 &&
          record.pasted_count >= 1
        ) {
          suspicionLevel = 'HIGH';
          patternType = 'Copied from answer box multiple times, then pasted back';
        }

        // MEDIUM SUSPICION: High paste percentage
        if (suspicionLevel !== 'HIGH' && pastePercentage >= 70 && total >= 3) {
          suspicionLevel = 'MEDIUM';
          patternType = 'High paste percentage';
        }

        // MEDIUM SUSPICION: Lots of switching
        if (suspicionLevel !== 'HIGH' && suspicionLevel !== 'MEDIUM') {
          if (record.tab_switch_count >= 3) {
            suspicionLevel = 'MEDIUM';
            patternType = 'Frequent tab switching';
          }
        }

        // MEDIUM SUSPICION: Extended time away
        if (
          suspicionLevel !== 'HIGH' && 
          suspicionLevel !== 'MEDIUM' &&
          record.longest_absence_seconds > 60
        ) {
          suspicionLevel = 'MEDIUM';
          patternType = 'Extended time away from question';
        }

        // MEDIUM SUSPICION: Long wait then paste
        if (
          suspicionLevel !== 'HIGH' &&
          suspicionLevel !== 'MEDIUM' &&
          timeToFirstInteraction !== null &&
          timeToFirstInteraction > 60 &&
          record.first_interaction_type === 'pasted'
        ) {
          suspicionLevel = 'MEDIUM';
          patternType = 'Long wait then paste';
        }

        // MEDIUM SUSPICION: Very few interactions for answer length
        if (
          suspicionLevel !== 'HIGH' &&
          suspicionLevel !== 'MEDIUM' &&
          total > 0 &&
          total < 5 &&
          (record.final_answer_length || 0) > 100
        ) {
          suspicionLevel = 'MEDIUM';
          patternType = 'Minimal interaction for answer length';
        }

        // Only flag if suspicion is MEDIUM or HIGH
        if (suspicionLevel !== 'LOW') {
          console.log('🚨 [AcademicIntegrity] FLAGGED:', {
            student_id: record.student_id,
            suspicionLevel,
            patternType
          });

          const assignmentTitle = (record.student_assignments as any)?.title || 'Unknown Assignment';

          flagged.push({
            student_id: record.student_id,
            student_name: studentNameMap.get(record.student_id) || 'Unknown',
            assignment_id: record.assignment_id,
            assignment_title: assignmentTitle,
            typed_count: record.typed_count || 0,
            pasted_count: record.pasted_count || 0,
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
          });
        }
      }

      // Sort by suspicion level (HIGH first) then by time
      flagged.sort((a, b) => {
        if (a.suspicion_level === b.suspicion_level) {
          return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
        }
        return a.suspicion_level === 'HIGH' ? -1 : 1;
      });

      console.log('🔍 [AcademicIntegrity] Final flagged count:', flagged.length);
      setFlaggedStudents(flagged);
    } catch (error) {
      console.error('Error in fetchFlaggedStudents:', error);
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
            Academic Integrity Insights
          </CardTitle>
          <CardDescription>Loading submission patterns...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Only show card if there are flagged students
  if (flaggedStudents.length === 0) {
    return null;
  }

  const highSuspicionCount = flaggedStudents.filter(s => s.suspicion_level === 'HIGH').length;
  const mediumSuspicionCount = flaggedStudents.filter(s => s.suspicion_level === 'MEDIUM').length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                Academic Integrity Insights
              </CardTitle>
              <CardDescription>
                <div className="space-y-1 mt-2">
                  <p className="text-foreground font-medium">
                    {flaggedStudents.length} submission(s) flagged for review
                  </p>
                  <div className="flex gap-3 text-sm">
                    {highSuspicionCount > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        🚨 {highSuspicionCount} HIGH priority (needs immediate review)
                      </span>
                    )}
                    {mediumSuspicionCount > 0 && (
                      <span className="text-orange-600 dark:text-orange-400">
                        ⚠️ {mediumSuspicionCount} MEDIUM priority (unusual patterns)
                      </span>
                    )}
                  </div>
                </div>
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-4">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent>
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 rounded-lg">
          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200 mb-2">
            ℹ️ Pattern Analysis Guide:
          </p>
          <ul className="text-xs text-yellow-800 dark:text-yellow-300 space-y-1 ml-4 list-disc">
            <li><strong>HIGH priority:</strong> Student switched tabs, returned and immediately pasted answer</li>
            <li><strong>HIGH priority:</strong> Complete answer pasted in one action with minimal typing</li>
            <li><strong>HIGH priority:</strong> Question copied, then quick paste response</li>
            <li><strong>MEDIUM priority:</strong> Frequent tab switching or extended time away from question</li>
            <li><strong>MEDIUM priority:</strong> Long absence followed by paste, or minimal interaction for answer length</li>
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
                    {student.suspicion_level === 'HIGH' ? '🚨 HIGH PRIORITY' : '⚠️ MEDIUM PRIORITY'} - Needs Review
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
                    {student.suspicion_level === 'HIGH' ? '🚨 Pattern: ' : '⚠️ Pattern: '}{student.pattern_type}
                  </p>
                  <p className={`text-xs mt-1 ${
                    student.suspicion_level === 'HIGH'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-orange-700 dark:text-orange-400'
                  }`}>
                    This pattern {student.suspicion_level === 'HIGH' ? 'may indicate' : 'suggests possible'} use of external resources and warrants review.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
};
