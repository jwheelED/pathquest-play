import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BookOpen, CheckCircle, Eye, Bell, AlertCircle, Save, Trash2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VersionHistoryTracker } from "./VersionHistoryTracker";
import { toast as sonnerToast } from "sonner";
import { useTabSwitchingDetection } from "@/hooks/useTabSwitchingDetection";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  mode: string;
  content: any;
  completed: boolean;
  created_at: string;
  grade?: number | null;
  quiz_responses?: any;
  saved_by_student?: boolean;
  auto_delete_at?: string | null;
  opened_at?: string | null;
  response_time_seconds?: number | null;
  answers_released?: boolean;
}

export const AssignedContent = ({ userId }: { userId: string }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, Record<number, string>>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, Record<number, string>>>({});
  const [submittedQuizzes, setSubmittedQuizzes] = useState<Record<string, boolean>>({});
  const [liveCheckIns, setLiveCheckIns] = useState<Assignment[]>([]);
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);
  const [openedTimes, setOpenedTimes] = useState<Record<string, number>>({});
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [accordionValue, setAccordionValue] = useState<string>("");
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [questionIncoming, setQuestionIncoming] = useState(false);
  const { toast } = useToast();
  
  // Tab switching detection for the currently open assignment
  const { tabSwitchingData, resetTracking } = useTabSwitchingDetection(!!activeAssignmentId);
  
  // Track previous length to detect new check-ins
  const prevLiveCheckInsLength = useRef(0);

  // Auto-expand first live check-in when available
  useEffect(() => {
    // Only auto-expand when we transition from 0 to 1+ check-ins
    // OR when a new check-in arrives and nothing is currently open
    const hasNewCheckIns = liveCheckIns.length > prevLiveCheckInsLength.current;
    
    if (liveCheckIns.length > 0 && !accordionValue && hasNewCheckIns) {
      const firstLiveCheckIn = liveCheckIns[0];
      setAccordionValue(firstLiveCheckIn.id);
      handleOpenAssignment(firstLiveCheckIn);
    }
    
    prevLiveCheckInsLength.current = liveCheckIns.length;
  }, [liveCheckIns]);

  useEffect(() => {
    fetchAssignments();
    
    let debounceTimer: NodeJS.Timeout;
    
    // Optimized real-time subscription using postgres_changes for new assignments
    // This provides reliable delivery for each student
    const assignmentChannel = supabase
      .channel(`student-assignments-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_assignments',
          filter: `student_id=eq.${userId}`
        },
        (payload) => {
          console.log('📬 New assignment received:', payload);
          
          // Show anticipation animation for lecture check-ins
          if (payload.new) {
            const newAssignment = payload.new as Assignment;
            
            if (newAssignment.assignment_type === 'lecture_checkin') {
              // Trigger animation
              setQuestionIncoming(true);
              
              // Show animation for 1.5 seconds before revealing question
              setTimeout(() => {
                setQuestionIncoming(false);
                
                // Add assignment to state
                setAssignments(prev => [newAssignment, ...prev]);
                
                // Update live check-ins
                if (!newAssignment.completed) {
                  setLiveCheckIns(prev => [newAssignment, ...prev]);
                }
                
                // Show notification
                sonnerToast.success("New Question!", {
                  description: `"${newAssignment.title}" is ready`
                });
              }, 1500);
            } else {
              // For non-lecture assignments, add immediately
              setAssignments(prev => [newAssignment, ...prev]);
            }
          }
          
          // Debounced full refresh to ensure consistency
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchAssignments();
          }, 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'student_assignments',
          filter: `student_id=eq.${userId}`
        },
        (payload) => {
          console.log('📝 Assignment updated:', payload);
          
          const oldAssignment = payload.old as Assignment;
          const updatedAssignment = payload.new as Assignment;
          
          // Immediate update for answers_released (no debounce for instant UI refresh)
          if ('answers_released' in updatedAssignment) {
            setAssignments(prev => 
              prev.map(a => a.id === updatedAssignment.id ? updatedAssignment : a)
            );
            
            // Show toast notification when answers are released
            if (updatedAssignment.answers_released && !oldAssignment.answers_released) {
              sonnerToast.success("Answers Released!", {
                description: `Answers for "${updatedAssignment.title}" are now available`
              });
            }
          }
          
          // Show toast notification when grade is posted
          if (updatedAssignment.grade !== null && updatedAssignment.grade !== undefined && oldAssignment.grade !== updatedAssignment.grade) {
            setAssignments(prev => 
              prev.map(a => a.id === updatedAssignment.id ? updatedAssignment : a)
            );
            
            sonnerToast.success("Grade Posted!", {
              description: `Your grade for "${updatedAssignment.title}": ${Math.round(updatedAssignment.grade)}%`
            });
          }
          
          // Debounced refresh for other updates
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchAssignments();
          }, 500);
        }
      )
      .on('system', {}, (payload) => {
        console.log('🔌 Realtime connection status:', payload);
        // Handle connection status updates
      })
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          console.log('✅ Real-time updates connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('error');
          console.error('❌ Real-time connection error:', status);
          // Retry connection after 5 seconds
          setTimeout(() => {
            console.log('🔄 Retrying real-time connection...');
            setRealtimeStatus('connecting');
          }, 5000);
        }
      });

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(assignmentChannel);
    };
  }, [userId]);

  const fetchAssignments = async () => {
    setIsRefreshing(true);
    try {
      // First, clean up old unsaved lecture check-ins (runs in background)
      try {
        await supabase.rpc('cleanup_unsaved_lecture_checkins');
      } catch (err) {
        console.error('Cleanup error (non-critical):', err);
      }

      // Optimized query: Fetch only today's assignments for live lecture use
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('student_assignments')
        .select('*')
        .eq('student_id', userId)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })
        .limit(30); // Optimized limit for live classroom

      if (error) {
        console.error('Error fetching assignments:', error);
        return;
      }
      
      const allAssignments = data || [];
      setAssignments(allAssignments);
      
      // Separate live check-ins for prominent display
      const checkIns = allAssignments.filter(
        a => a.assignment_type === 'lecture_checkin' && !a.completed
      );
      setLiveCheckIns(checkIns);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAnswerSelect = (assignmentId: string, questionIndex: number, answer: string) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionIndex]: answer
      }
    }));
  };

  const handleTextAnswerChange = (assignmentId: string, questionIndex: number, answer: string) => {
    setTextAnswers(prev => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionIndex]: answer
      }
    }));
  };

  const handleSubmitQuiz = async (assignment: Assignment) => {
    const mcAnswers = selectedAnswers[assignment.id] || {};
    const textAns = textAnswers[assignment.id] || {};
    const questions = assignment.content.questions || [];
    
    // Combine both answer types
    const allAnswers: Record<number, string> = {};
    questions.forEach((q: any, idx: number) => {
      if (q.type === 'short_answer') {
        allAnswers[idx] = textAns[idx] || '';
      } else {
        allAnswers[idx] = mcAnswers[idx] || '';
      }
    });
    
    // Check if all questions are answered
    const answeredCount = Object.keys(allAnswers).filter(key => allAnswers[parseInt(key)]).length;
    if (answeredCount !== questions.length) {
      toast({ 
        title: "Please answer all questions", 
        description: `You've answered ${answeredCount} out of ${questions.length} questions`,
        variant: "destructive" 
      });
      return;
    }

    // Calculate response time if this was opened (for lecture check-ins)
    let responseTimeSeconds: number | null = null;
    if (openedTimes[assignment.id]) {
      responseTimeSeconds = Math.floor((Date.now() - openedTimes[assignment.id]) / 1000);
    }

    try {
      // Use secure RPC function for server-side grading
      const { data, error } = await supabase
        .rpc('submit_quiz', {
          p_assignment_id: assignment.id,
          p_user_answers: allAnswers
        });

      if (error) {
        throw error;
      }

      const result = data as { 
        grade: number | null; 
        correct: number; 
        total: number; 
        pending_review: boolean;
        has_short_answer: boolean;
        assignment_mode: string;
      };

      // Update response time in database if tracked
      if (responseTimeSeconds !== null) {
        await supabase
          .from('student_assignments')
          .update({ response_time_seconds: responseTimeSeconds })
          .eq('id', assignment.id);
      }

      setSubmittedQuizzes(prev => ({ ...prev, [assignment.id]: true }));
      
      // Save version history for cheat detection
      // For short answers, use version history data; for MCQ-only, use tab switching data
      const firstShortAnswerIdx = questions.findIndex((q: any) => q.type === 'short_answer');
      const versionHistoryData = firstShortAnswerIdx >= 0 
        ? textAns[`${firstShortAnswerIdx}_version_history`]
        : null;
      
      // Prepare tab switching data - use version history data if available (short answer),
      // otherwise use global tab switching detection (MCQ)
      const tabData = versionHistoryData || tabSwitchingData;
      
      if (tabData && userId) {
        const { error: versionError } = await supabase
          .from('answer_version_history')
          .upsert({
            student_id: userId,
            assignment_id: assignment.id,
            version_events: versionHistoryData?.events || [],
            typed_count: versionHistoryData?.typed_count || 0,
            pasted_count: versionHistoryData?.pasted_count || 0,
            question_displayed_at: tabData.question_displayed_at,
            first_interaction_at: versionHistoryData?.first_interaction_at,
            first_interaction_type: versionHistoryData?.first_interaction_type,
            first_interaction_size: versionHistoryData?.first_interaction_size,
            question_copied: versionHistoryData?.question_copied || false,
            question_copied_at: versionHistoryData?.question_copied_at,
            final_answer_length: versionHistoryData?.final_answer_length || 0,
            editing_events_after_first_paste: versionHistoryData?.editing_events_after_first_paste || 0,
            tab_switch_count: tabData.tab_switch_count,
            total_time_away_seconds: tabData.total_time_away_seconds,
            tab_switches: tabData.tab_switches,
            longest_absence_seconds: tabData.longest_absence_seconds,
            switched_away_immediately: tabData.switched_away_immediately
          }, {
            onConflict: 'student_id,assignment_id'
          });

        if (versionError) {
          console.error('Failed to save version history:', versionError);
        }
      }
      
      // Reset tab switching tracking after submission
      setActiveAssignmentId(null);
      resetTracking();
      
      // If there are short answers, get AI grades (for auto-grading or recommendations)
      if (result.has_short_answer) {
        const isAutoGrade = result.assignment_mode === 'auto_grade';
        
        toast({
          title: isAutoGrade ? "Auto-grading short answers..." : "Getting AI recommendations...",
          description: isAutoGrade ? "Please wait while we grade your responses" : "Generating recommended grades for instructor review"
        });

        let totalShortAnswerGrade = 0;
        let shortAnswerCount = 0;
        const recommendedGrades: Record<number, { grade: number; feedback: string }> = {};

        for (let idx = 0; idx < questions.length; idx++) {
          const q = questions[idx];
          if (q.type === 'short_answer') {
            shortAnswerCount++;
            const studentAnswer = allAnswers[idx];
            
            try {
              const { data: gradeData, error: gradeError } = await supabase.functions.invoke(
                'auto-grade-short-answer',
                {
                  body: {
                    studentAnswer,
                    expectedAnswer: q.expectedAnswer || '',
                    question: q.question
                  }
                }
              );

              if (gradeError) {
                console.error('Auto-grade error:', gradeError);
                throw gradeError;
              }

              totalShortAnswerGrade += gradeData.grade;
              recommendedGrades[idx] = {
                grade: gradeData.grade,
                feedback: gradeData.feedback
              };
            } catch (gradeErr) {
              console.error('Failed to auto-grade question', idx, gradeErr);
              // Continue with other questions even if one fails
            }
          }
        }

        // Calculate combined grade (MC + short answer average)
        const shortAnswerAvg = shortAnswerCount > 0 ? totalShortAnswerGrade / shortAnswerCount : 0;
        const mcGrade = result.grade || 0;
        const combinedGrade = result.total > 0 
          ? ((mcGrade * result.total) + (shortAnswerAvg * shortAnswerCount)) / (result.total + shortAnswerCount)
          : shortAnswerAvg;

        if (isAutoGrade) {
          // Update assignment with combined grade for auto-grade mode
          const { error: updateError } = await supabase
            .from('student_assignments')
            .update({ grade: combinedGrade })
            .eq('id', assignment.id);

          if (updateError) {
            console.error('Failed to update grade:', updateError);
          }

          toast({ 
            title: "✅ Quiz Submitted Successfully!",
            description: "Your answers have been submitted for review."
          });
        } else {
          // For manual_grade mode, store recommended grades in quiz_responses
          const updatedResponses = {
            ...allAnswers,
            _ai_recommendations: recommendedGrades
          };

          const { error: updateError } = await supabase
            .from('student_assignments')
            .update({ quiz_responses: updatedResponses })
            .eq('id', assignment.id);

          if (updateError) {
            console.error('Failed to store recommendations:', updateError);
          }

          toast({ 
            title: "✅ Quiz Submitted Successfully!",
            description: "Your answers have been submitted for review."
          });
        }
      } else {
        // All submissions show same message without scores
        toast({ 
          title: "✅ Quiz Submitted Successfully!",
          description: "Your answers have been submitted for review."
        });
      }
      
      // Refresh assignments to show updated state
      await fetchAssignments();

      // For lecture check-ins, update streak tracking and trigger achievement check
      if (assignment.assignment_type === 'lecture_checkin') {
        await updateCheckInStreak(assignment.grade || 0);
      }
    } catch (error: any) {
      console.error('Submit quiz error:', error);
      toast({ 
        title: "Failed to submit quiz", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  };

  const updateCheckInStreak = async (grade: number) => {
    if (!userId) return;

    try {
      const isPerfectScore = grade === 100;
      const today = new Date().toISOString().split('T')[0];

      // Get or create check-in streak record
      let { data: streakData, error: fetchError } = await supabase
        .from('checkin_streaks')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // Create new streak record
        const { data: newStreak, error: insertError } = await supabase
          .from('checkin_streaks')
          .insert([{
            user_id: userId,
            current_streak: isPerfectScore ? 1 : 0,
            longest_streak: isPerfectScore ? 1 : 0,
            last_correct_date: isPerfectScore ? today : null
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        streakData = newStreak;
      }

      if (streakData) {
        const lastCorrectDate = streakData.last_correct_date;
        let newCurrentStreak = streakData.current_streak;
        let newLongestStreak = streakData.longest_streak;

        if (isPerfectScore) {
          // Check if this continues the streak (answered today or yesterday)
          const lastDate = lastCorrectDate ? new Date(lastCorrectDate) : null;
          const isConsecutive = lastDate && 
            (lastDate.toISOString().split('T')[0] === today || 
             Math.abs(new Date(today).getTime() - lastDate.getTime()) <= 24 * 60 * 60 * 1000);

          if (isConsecutive) {
            newCurrentStreak += 1;
          } else {
            newCurrentStreak = 1;
          }

          newLongestStreak = Math.max(newLongestStreak, newCurrentStreak);

          // Update streak
          const { error: updateError } = await supabase
            .from('checkin_streaks')
            .update({
              current_streak: newCurrentStreak,
              longest_streak: newLongestStreak,
              last_correct_date: today,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

          if (updateError) throw updateError;

          // Check for streak achievements
          if (newCurrentStreak === 3) {
            sonnerToast.success("🍎 Achievement Progress!", {
              description: "Teacher's Pet achievement incoming! Keep the streak going!"
            });
          }
        } else {
          // Reset streak on incorrect answer
          if (newCurrentStreak > 0) {
            const { error: resetError } = await supabase
              .from('checkin_streaks')
              .update({
                current_streak: 0,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId);

            if (resetError) throw resetError;
          }
        }
      }
    } catch (error) {
      console.error('Error updating check-in streak:', error);
      // Don't throw - streak tracking shouldn't block submission
    }
  };

  const handleComplete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_assignments')
        .update({ completed: true })
        .eq('id', id);

      if (error) throw error;

      toast({ title: "✅ Assignment completed!" });
      await fetchAssignments();
    } catch (error: any) {
      console.error('Complete assignment error:', error);
      toast({ 
        title: "Failed to mark complete", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  };

  const handleSaveQuestion = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('student_assignments')
        .update({ saved_by_student: true, auto_delete_at: null })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({ 
        title: "📌 Question Saved!", 
        description: "This question will be kept in your assignments" 
      });
      await fetchAssignments();
    } catch (error: any) {
      console.error('Save question error:', error);
      toast({ 
        title: "Failed to save question", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    }
  };

  const handleOpenAssignment = async (assignment: Assignment) => {
    // Only track opening for lecture check-ins that haven't been opened yet
    if (assignment.assignment_type === 'lecture_checkin' && !assignment.opened_at && !openedTimes[assignment.id]) {
      setOpenedTimes(prev => ({ ...prev, [assignment.id]: Date.now() }));
      
      // Update database with opened timestamp
      await supabase
        .from('student_assignments')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', assignment.id);
    }
    
    // Start tab switching detection for this assignment
    setActiveAssignmentId(assignment.id);
    setViewingId(assignment.id);
  };

  const handleToggleShowAll = () => {
    const newShowAll = !showAllCheckIns;
    setShowAllCheckIns(newShowAll);
    
    // If we're hiding items and the currently open item would be hidden, close it
    if (!newShowAll && accordionValue) {
      const isCurrentItemVisible = liveCheckIns.slice(0, 3).some(ci => ci.id === accordionValue);
      if (!isCurrentItemVisible) {
        setAccordionValue("");
        setActiveAssignmentId(null);
        resetTracking();
      }
    }
  };

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assigned Content</CardTitle>
          <CardDescription>No assignments yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      {/* Question Incoming Animation Overlay */}
      {questionIncoming && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/20 animate-pulse" />
          <div className="relative z-10 bg-background/95 border-2 border-primary rounded-lg p-8 shadow-2xl animate-scale-in">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Bell className="h-16 w-16 text-primary animate-bounce" />
                <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-primary">Question Incoming!</h3>
                <p className="text-muted-foreground">Your instructor is sending a new question...</p>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}
      
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Assigned Content</CardTitle>
            <CardDescription>{assignments.filter(a => !a.completed).length} active assignment(s)</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Real-time connection status indicator */}
            <div className="flex items-center gap-1.5 text-xs">
              {realtimeStatus === 'connected' ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-muted-foreground">Live</span>
                </>
              ) : realtimeStatus === 'connecting' ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-yellow-600 animate-pulse" />
                  <span className="text-muted-foreground">Connecting...</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-muted-foreground">Offline</span>
                </>
              )}
            </div>
            {/* Manual refresh button */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={fetchAssignments}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Lecture Check-in Alert */}
        {liveCheckIns.length > 0 && (
          <div className="space-y-3">
            <Alert className="border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
              <Bell className="h-5 w-5 text-orange-600 animate-pulse" />
              <AlertTitle className="text-orange-900 dark:text-orange-200 font-bold">
                🎯 Live Check-in Available!
              </AlertTitle>
              <AlertDescription className="text-orange-800 dark:text-orange-300">
                Your instructor has sent {liveCheckIns.length} check-in question(s) during the lecture. 
                Answer now to show engagement!
              </AlertDescription>
            </Alert>
            {liveCheckIns.length > 3 && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleShowAll}
                >
                  {showAllCheckIns ? 'Show Recent (3)' : `Show All (${liveCheckIns.length})`}
                </Button>
              </div>
            )}
          </div>
        )}

        <Accordion 
          type="single" 
          collapsible
          value={accordionValue}
          onValueChange={(value) => {
            // Only update if the value corresponds to an actual assignment
            const assignment = assignments.find(a => a.id === value);
            
            if (value && assignment) {
              setAccordionValue(value);
              handleOpenAssignment(assignment);
            } else if (!value) {
              // Closing accordion
              setAccordionValue("");
              setActiveAssignmentId(null);
              resetTracking();
            }
          }}
        >
          {assignments
            .filter(assignment => {
              // Filter live check-ins based on showAllCheckIns state
              if (assignment.assignment_type === 'lecture_checkin' && !assignment.completed) {
                if (!showAllCheckIns && liveCheckIns.length > 3) {
                  // Only show last 3 check-ins
                  return liveCheckIns.slice(0, 3).some(ci => ci.id === assignment.id);
                }
              }
              return true;
            })
            .map((assignment) => (
            <AccordionItem key={assignment.id} value={assignment.id}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  {assignment.assignment_type === 'lecture_checkin' && !assignment.completed && (
                    <Bell className="h-4 w-4 text-orange-500 animate-pulse" />
                  )}
                  <BookOpen className="h-4 w-4" />
                  <span>{assignment.title}</span>
                  <Badge variant={assignment.completed ? "default" : assignment.assignment_type === 'lecture_checkin' ? "destructive" : "secondary"}>
                    {assignment.assignment_type === 'lecture_checkin' ? 'LIVE CHECK-IN' : assignment.assignment_type.replace('_', ' ')}
                  </Badge>
                  {assignment.completed && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {/* Live Check-in Notice */}
                  {assignment.assignment_type === 'lecture_checkin' && !assignment.completed && (
                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-900 dark:text-blue-200">
                        Your answer activity is being tracked
                      </AlertTitle>
                      <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
                        Tab switching and answer input detection is enabled to ensure academic integrity.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Quiz/Lecture Check-in Display */}
                  {(assignment.assignment_type === 'quiz' || assignment.assignment_type === 'lecture_checkin') && assignment.content.questions && (
                    <div className="space-y-4">
                      {assignment.content.questions.map((q: any, idx: number) => {
                        const isSubmitted = submittedQuizzes[assignment.id] || assignment.completed;
                        
                        // Handle coding questions
                        if (q.type === 'coding') {
                          const codeAnswer = textAnswers[assignment.id]?.[idx] || '';
                          
                          return (
                            <div key={idx} className="border rounded-lg p-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                                {q.language && (
                                  <Badge variant="secondary" className="shrink-0">
                                    {q.language}
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Your Code:</label>
                                <VersionHistoryTracker
                                  value={codeAnswer}
                                  onChange={(value) => handleTextAnswerChange(assignment.id, idx, value)}
                                  onVersionChange={(history) => {
                                    setTextAnswers(prev => ({
                                      ...prev,
                                      [assignment.id]: {
                                        ...(prev[assignment.id] || {}),
                                        [`${idx}_version_history`]: history
                                      }
                                    }));
                                  }}
                                  questionText={q.question}
                                  isCodeEditor={true}
                                />
                              </div>
                               {isSubmitted && (
                                <div className="space-y-2">
                                  {assignment.assignment_type === 'lecture_checkin' ? (
                                    // Hide feedback for lecture check-ins
                                    <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200">✓ Submitted</p>
                                      <p className="text-xs text-blue-800 dark:text-blue-300">Your instructor will review your code.</p>
                                    </div>
                                  ) : assignment.mode === 'manual_grade' ? (
                                    <div className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">⏳ Pending Instructor Review</p>
                                      <p className="text-xs text-yellow-800 dark:text-yellow-300">Your instructor will review and grade your code.</p>
                                    </div>
                                  ) : (
                                    assignment.quiz_responses?._ai_recommendations?.[idx] && (
                                      <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                                        <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                          ✅ Score: {assignment.quiz_responses._ai_recommendations[idx].grade}%
                                        </p>
                                        <p className="text-xs text-green-800 dark:text-green-300 mt-1">
                                          {assignment.quiz_responses._ai_recommendations[idx].feedback}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        // Handle short answer questions
                        if (q.type === 'short_answer') {
                          const textAnswer = textAnswers[assignment.id]?.[idx] || '';
                          
                          return (
                            <div key={idx} className="border rounded-lg p-4 space-y-3">
                              <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                              <VersionHistoryTracker
                                value={textAnswer}
                                onChange={(value) => handleTextAnswerChange(assignment.id, idx, value)}
                                onVersionChange={(history) => {
                                  // Store version history for cheat detection
                                  setTextAnswers(prev => ({
                                    ...prev,
                                    [assignment.id]: {
                                      ...(prev[assignment.id] || {}),
                                      [`${idx}_version_history`]: history
                                    }
                                  }));
                                }}
                                questionText={q.question}
                              />
                              {isSubmitted && (
                                <div className="space-y-2">
                                  {assignment.assignment_type === 'lecture_checkin' ? (
                                    // Hide feedback for lecture check-ins
                                    <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200">✓ Submitted</p>
                                      <p className="text-xs text-blue-800 dark:text-blue-300">Your instructor will review this answer.</p>
                                    </div>
                                  ) : assignment.mode === 'manual_grade' ? (
                                    // Show pending review for manual grade mode
                                    <>
                                      {q.expectedAnswer && (
                                        <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded">
                                          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Expected Answer:</p>
                                          <p className="text-sm text-blue-800 dark:text-blue-300">{q.expectedAnswer}</p>
                                        </div>
                                      )}
                                      <div className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded border border-yellow-200 dark:border-yellow-800">
                                        <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">⏳ Pending Instructor Review</p>
                                        <p className="text-xs text-yellow-800 dark:text-yellow-300">Your instructor will review and grade this answer.</p>
                                      </div>
                                    </>
                                  ) : (
                                    // Show AI feedback for auto grade mode
                                    assignment.quiz_responses?._ai_recommendations?.[idx] && (
                                      <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                                        <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                          ✅ Score: {assignment.quiz_responses._ai_recommendations[idx].grade}%
                                        </p>
                                        <p className="text-xs text-green-800 dark:text-green-300 mt-1">
                                          {assignment.quiz_responses._ai_recommendations[idx].feedback}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        // Handle multiple choice questions
                        const selectedAnswer = selectedAnswers[assignment.id]?.[idx];
                        
                        return (
                          <div key={idx} className="border rounded-lg p-4 space-y-3">
                            <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                            <div className="space-y-2">
                              {q.options?.map((opt: string, i: number) => {
                                const optionLetter = opt.trim().charAt(0).toUpperCase();
                                const normalizedSelected = selectedAnswer?.trim().toUpperCase();
                                const isSelected = normalizedSelected === optionLetter;
                                
                                return (
                                  <button
                                    key={`${idx}-${i}`}
                                    disabled={isSubmitted}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAnswerSelect(assignment.id, idx, optionLetter);
                                    }}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      isSelected && !isSubmitted ? 'border-primary bg-primary/5' :
                                      'border-border hover:border-primary/50'
                                    } ${isSubmitted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                  >
                                    <span className="text-sm">{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                            
                            {isSubmitted && (
                              <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                                  ✓ Submitted - {assignment.answers_released ? 'Answers Released' : 'Awaiting answer release'}
                                </p>
                              </div>
                            )}
                            
                            {(assignment.mode === "hints_only" || assignment.mode === "hints_solutions") && !isSubmitted && (
                              <div className="bg-muted/50 p-3 rounded space-y-2">
                                <p className="text-xs font-medium">Hint 1 (Conceptual):</p>
                                <p className="text-xs text-muted-foreground">{q.hint1}</p>
                                <p className="text-xs font-medium">Hint 2 (Narrowing):</p>
                                <p className="text-xs text-muted-foreground">{q.hint2}</p>
                                <p className="text-xs font-medium">Hint 3 (Reasoning):</p>
                                <p className="text-xs text-muted-foreground">{q.hint3}</p>
                              </div>
                            )}
                            
                            {assignment.mode === "hints_solutions" && isSubmitted && assignment.answers_released && (
                              <div className="bg-primary/5 p-3 rounded space-y-1">
                                <p className="text-xs font-semibold">Explanation:</p>
                                <p className="text-xs text-muted-foreground">{q.solution}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {!assignment.completed && (
                        <Button onClick={() => handleSubmitQuiz(assignment)} className="w-full">
                          Submit Quiz
                        </Button>
                      )}
                      
                      {assignment.completed && (
                        <div className="space-y-3">
                          {/* Hide scores until instructor releases answers */}
                          {!assignment.answers_released ? (
                            <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">
                              <p className="text-lg font-semibold text-yellow-900 dark:text-yellow-200">⏳ Awaiting Answer Release</p>
                              <p className="text-sm text-yellow-800 dark:text-yellow-300">Your instructor will release answers and scores when ready</p>
                            </div>
                          ) : assignment.assignment_type === 'lecture_checkin' ? (
                            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                              <p className="text-lg font-semibold text-blue-900 dark:text-blue-200">✓ Submitted</p>
                              <p className="text-sm text-blue-800 dark:text-blue-300">Your instructor has reviewed your response</p>
                            </div>
                          ) : (
                            // Show scores only after answers are released
                            assignment.grade !== undefined && assignment.grade !== null ? (
                              <div className="bg-primary/10 p-4 rounded-lg text-center">
                                <p className="text-lg font-semibold">Your Score: {(assignment.grade || 0).toFixed(0)}%</p>
                              </div>
                            ) : (
                              <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">
                                <p className="text-lg font-semibold text-yellow-900 dark:text-yellow-200">⏳ Pending Review</p>
                                <p className="text-sm text-yellow-800 dark:text-yellow-300">Your instructor is reviewing your answers</p>
                              </div>
                            )
                          )}
                          
                          {/* Save button for lecture check-ins */}
                          {assignment.assignment_type === 'lecture_checkin' && !assignment.saved_by_student && (
                            <div className="space-y-2">
                              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                                <Trash2 className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-amber-900 dark:text-amber-200 text-sm">
                                  Auto-Delete in 24 hours
                                </AlertTitle>
                                <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs">
                                  This question will be automatically deleted unless you save it.
                                  {assignment.auto_delete_at && (
                                    <span className="block mt-1">
                                      Deletes at: {new Date(assignment.auto_delete_at).toLocaleString()}
                                    </span>
                                  )}
                                </AlertDescription>
                              </Alert>
                              <Button 
                                onClick={() => handleSaveQuestion(assignment.id)} 
                                className="w-full"
                                variant="outline"
                              >
                                <Save className="mr-2 h-4 w-4" />
                                Save This Question
                              </Button>
                            </div>
                          )}
                          
                          {assignment.assignment_type === 'lecture_checkin' && assignment.saved_by_student && (
                            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg text-center border border-green-200 dark:border-green-800">
                              <p className="text-sm font-medium text-green-900 dark:text-green-200">
                                <Save className="inline h-4 w-4 mr-1" />
                                Question Saved
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lesson Display */}
                  {assignment.assignment_type === 'lesson' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">{assignment.content.title}</h4>
                        <div className="text-sm text-muted-foreground whitespace-pre-line">
                          {assignment.content.content}
                        </div>
                      </div>
                      {assignment.content.codeExample && (
                        <div>
                          <h4 className="font-semibold mb-2">Code Example</h4>
                          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                            {assignment.content.codeExample}
                          </pre>
                          {assignment.content.explanation && (
                            <p className="text-sm text-muted-foreground mt-2">{assignment.content.explanation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mini Project Display */}
                  {assignment.assignment_type === 'mini_project' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">{assignment.content.title}</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {assignment.content.prompt}
                        </p>
                      </div>
                      
                      {(assignment.mode === "hints_only" || assignment.mode === "hints_solutions") && (
                        <div className="bg-muted/50 p-4 rounded space-y-3">
                          <div>
                            <p className="text-sm font-medium">Hint 1 (Conceptual Approach):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint1}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Hint 2 (Key Steps):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint2}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Hint 3 (Structure Guidance):</p>
                            <p className="text-sm text-muted-foreground">{assignment.content.hint3}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {assignment.assignment_type !== 'quiz' && !assignment.completed && (
                    <Button onClick={() => handleComplete(assignment.id)} className="w-full">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Complete
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
    </>
  );
};