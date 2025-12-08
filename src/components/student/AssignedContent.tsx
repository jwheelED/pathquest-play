import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, CheckCircle, Eye, Bell, AlertCircle, Save, Trash2, RefreshCw, Wifi, WifiOff, Clock, Database, Lightbulb, Code2, ChevronDown, Play, CheckCircle2, XCircle, Loader2, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VersionHistoryTracker } from "./VersionHistoryTracker";
import { toast as sonnerToast } from "sonner";
import { useTabSwitchingDetection } from "@/hooks/useTabSwitchingDetection";
import { playNotificationSound } from "@/lib/audioNotification";
import { ConfidenceSelector, ConfidenceLevel } from "./ConfidenceSelector";
import ReactMarkdown from "react-markdown";
import { LectureCountdownTimer } from "./LectureCountdownTimer";

const BASE_REWARD = 10; // Base XP for lecture check-in questions

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

interface AssignedContentProps {
  userId: string;
  instructorId?: string; // Optional: filter by instructor
  onAnswerResult?: (isCorrect: boolean, grade: number) => void;
}

// Confidence data for each assignment
interface ConfidenceData {
  level: ConfidenceLevel;
  multiplier: number;
  locked: boolean;
}

export const AssignedContent = ({ userId, instructorId, onAnswerResult }: AssignedContentProps) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, Record<number, string>>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, Record<number, string>>>({});
  const [submittedQuizzes, setSubmittedQuizzes] = useState<Record<string, boolean>>({});
  const [codeExecutionResults, setCodeExecutionResults] = useState<Record<string, any>>({});
  const [executingCode, setExecutingCode] = useState<Record<string, boolean>>({});
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);
  const [openedTimes, setOpenedTimes] = useState<Record<string, number>>({});
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [accordionValue, setAccordionValue] = useState<string>("");
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [questionIncoming, setQuestionIncoming] = useState(false);
  const [aiExplanations, setAiExplanations] = useState<Record<string, Record<number, { explanation: string; cached: boolean }>>>({});
  const [loadingExplanations, setLoadingExplanations] = useState<Record<string, Record<number, boolean>>>({});
  const [retryCount, setRetryCount] = useState(0);
  // Confidence betting state per assignment
  const [confidenceData, setConfidenceData] = useState<Record<string, ConfidenceData>>({});
  const [showConfidenceSelector, setShowConfidenceSelector] = useState<Record<string, boolean>>({});
  const [pointsEarned, setPointsEarned] = useState<Record<string, number>>({});
  const { toast } = useToast();
  
  // Tab switching detection for the currently open assignment
  const { tabSwitchingData, resetTracking } = useTabSwitchingDetection(!!activeAssignmentId);
  
  // Derive live check-ins from assignments (no separate state needed)
  const liveCheckIns = assignments.filter(
    a => a.assignment_type === 'lecture_checkin' && !a.completed
  );
  
  // Track previous length to detect new check-ins
  const prevLiveCheckInsLength = useRef(0);

  // Auto-expand first live check-in when available
  useEffect(() => {
    // Only auto-expand when we transition from 0 to 1+ check-ins
    // OR when a new check-in arrives and nothing is currently open
    const hasNewCheckIns = liveCheckIns.length > prevLiveCheckInsLength.current;
    
    if (liveCheckIns.length > 0 && !accordionValue && hasNewCheckIns) {
      const firstLiveCheckIn = liveCheckIns[0];
      console.log('🎯 Auto-expanding first live check-in:', firstLiveCheckIn.id);
      setAccordionValue(firstLiveCheckIn.id);
      handleOpenAssignment(firstLiveCheckIn);
    }
    
    prevLiveCheckInsLength.current = liveCheckIns.length;
  }, [liveCheckIns, accordionValue]);

  // Polling fallback when realtime disconnected (5 second interval for faster recovery)
  useEffect(() => {
    if (realtimeStatus !== 'connected') {
      const pollInterval = setInterval(() => {
        console.log('📡 Polling fallback - fetching assignments...');
        fetchAssignments();
      }, 5000); // Reduced from 10s to 5s for better UX
      
      return () => clearInterval(pollInterval);
    }
  }, [realtimeStatus]);

  // Main realtime subscription with resilience improvements
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    let assignmentChannel: any = null;
    let isSubscribed = false;
    
    const setupRealtimeSubscription = async () => {
      // Step 1: Verify authentication before subscribing
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('⚠️ No session found, skipping realtime setup');
        setRealtimeStatus('error');
        return;
      }

      console.log('🔌 Setting up realtime subscription for student:', userId);
      setRealtimeStatus('connecting');
      
      // Step 2: Set up subscription WITH server-side filter for better performance
      assignmentChannel = supabase
        .channel(`student-assignments-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'student_assignments',
            filter: `student_id=eq.${userId}` // Server-side filter - only this student's events
          },
          (payload) => {
            // Server-side filtering already applied - no client-side check needed
            console.log('📬 New assignment received via realtime:', payload);
            console.log('📊 Assignment details:', {
              id: payload.new?.id,
              title: (payload.new as any)?.title,
              type: (payload.new as any)?.assignment_type,
              student_id: (payload.new as any)?.student_id
            });
            
            const newAssignment = payload.new as Assignment;
            
            if (newAssignment.assignment_type === 'lecture_checkin') {
              // Trigger animation
              setQuestionIncoming(true);
              
              // Play audio notification
              playNotificationSound().catch(err => 
                console.log('Could not play notification sound:', err)
              );
              
              // Show animation for 1.5 seconds before revealing question
              setTimeout(() => {
                setQuestionIncoming(false);
                
                // Add assignment to state with proper deduplication
                setAssignments(prev => {
                  if (prev.some(a => a.id === newAssignment.id)) {
                    console.log('⚠️ Assignment already exists, skipping duplicate:', newAssignment.id);
                    return prev;
                  }
                  console.log('✅ Adding new assignment:', newAssignment.id);
                  return [newAssignment, ...prev];
                });
                
                // Show notification
                sonnerToast.success("New Question!", {
                  description: `"${newAssignment.title}" is ready`
                });
              }, 1500);
            } else {
              // For non-lecture assignments, add immediately with deduplication
              setAssignments(prev => {
                if (prev.some(a => a.id === newAssignment.id)) {
                  console.log('⚠️ Assignment already exists, skipping duplicate:', newAssignment.id);
                  return prev;
                }
                console.log('✅ Adding new assignment:', newAssignment.id);
                return [newAssignment, ...prev];
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'student_assignments',
            filter: `student_id=eq.${userId}` // Server-side filter - only this student's events
          },
          (payload) => {
            // Server-side filtering already applied
            console.log('📝 Assignment updated:', payload);
            
            const oldAssignment = payload.old as Assignment;
            const updatedAssignment = payload.new as Assignment;
            
            // Immediate update for answers_released
            if ('answers_released' in updatedAssignment) {
              setAssignments(prev => 
                prev.map(a => a.id === updatedAssignment.id ? updatedAssignment : a)
              );
              
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
        .subscribe((status) => {
          console.log('📡 Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            setRealtimeStatus('connected');
            setRetryCount(0); // Reset retry count on success
            console.log('✅ Real-time updates connected for student:', userId);
            sonnerToast.success('Ready for Questions', {
              description: 'Listening for new questions from your instructor',
              duration: 3000,
            });
            // Immediately fetch to catch any questions sent during connection setup
            setTimeout(() => fetchAssignments(), 500);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setRealtimeStatus('error');
            console.error('❌ Real-time connection error:', status);
            
            // Step 4: Exponential backoff retry
            if (!isSubscribed && retryCount < 5) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
              console.log(`🔄 Retrying connection in ${delay}ms (attempt ${retryCount + 1}/5)...`);
              
              setTimeout(() => {
                setRetryCount(prev => prev + 1);
                setupRealtimeSubscription();
              }, delay);
            } else if (retryCount >= 5) {
              sonnerToast.error('Connection Failed', {
                description: 'Cannot establish live connection. Using backup polling.',
                duration: 5000,
              });
            }
          }
        });
    };
    
    // Initial setup
    fetchAssignments();
    setupRealtimeSubscription();

    // Step 3: Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        console.log('🔄 Auth state changed, reconnecting realtime...', event);
        if (assignmentChannel) {
          supabase.removeChannel(assignmentChannel);
        }
        setupRealtimeSubscription();
      }
    });

    return () => {
      clearTimeout(debounceTimer);
      if (assignmentChannel) {
        supabase.removeChannel(assignmentChannel);
      }
      subscription.unsubscribe();
    };
  }, [userId, retryCount]);

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

      let query = supabase
        .from('student_assignments')
        .select('*')
        .eq('student_id', userId)
        .gte('created_at', today.toISOString());

      // Filter by instructor if provided
      if (instructorId) {
        query = query.eq('instructor_id', instructorId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Error fetching assignments:', error);
        return;
      }
      
      // Deduplicate by ID (just in case)
      const uniqueAssignments = Array.from(
        new Map((data || []).map(a => [a.id, a])).values()
      );
      
      const prevLength = assignments.length;
      setAssignments(uniqueAssignments);
      
      console.log(`✅ Fetched ${uniqueAssignments.length} unique assignments (had ${prevLength})`);
      
      // Notify if new assignments found on initial load or manual refresh
      const newCount = uniqueAssignments.length - prevLength;
      if (newCount > 0 && prevLength > 0) {
        sonnerToast.info(`${newCount} new assignment${newCount > 1 ? 's' : ''} found!`);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAnswerSelect = (assignmentId: string, questionIndex: number, answer: string, assignment: Assignment) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [questionIndex]: answer
      }
    }));
    
    // For lecture check-ins with MCQ, show confidence selector after selecting answer
    if (assignment.assignment_type === 'lecture_checkin') {
      const questions = assignment.content.questions || [];
      const hasMCQ = questions.some((q: any) => q.type !== 'short_answer' && q.type !== 'coding');
      if (hasMCQ) {
        setShowConfidenceSelector(prev => ({
          ...prev,
          [assignmentId]: true
        }));
      }
    }
  };

  const handleConfidenceSelect = (assignmentId: string, level: ConfidenceLevel, multiplier: number) => {
    setConfidenceData(prev => ({
      ...prev,
      [assignmentId]: { level, multiplier, locked: true }
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

  const handleGetAiExplanation = async (assignment: Assignment, question: any, questionIdx: number) => {
    // Set loading state
    setLoadingExplanations(prev => ({
      ...prev,
      [assignment.id]: {
        ...(prev[assignment.id] || {}),
        [questionIdx]: true
      }
    }));

    try {
      // Get student's answer and correct answer
      const studentAnswer = assignment.quiz_responses?.[questionIdx];
      const correctAnswer = question.correctAnswer;
      const wasCorrect = studentAnswer === correctAnswer;
      
      // Find the full text of both answers
      const studentAnswerText = question.options?.find((opt: string) => 
        opt.trim().charAt(0).toUpperCase() === studentAnswer
      ) || studentAnswer;
      
      const correctAnswerText = question.options?.find((opt: string) => 
        opt.trim().charAt(0).toUpperCase() === correctAnswer
      ) || correctAnswer;

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('generate-detailed-explanation', {
        body: {
          problemText: question.question,
          correctAnswer: correctAnswerText,
          userAnswer: studentAnswerText,
          wasCorrect,
          courseContext: assignment.title || ''
        }
      });

      if (error) throw error;

      // Store the explanation with cache status
      setAiExplanations(prev => ({
        ...prev,
        [assignment.id]: {
          ...(prev[assignment.id] || {}),
          [questionIdx]: {
            explanation: data.explanation || data.detailedExplanation,
            cached: data.cached || false
          }
        }
      }));

      // Show different toast based on cache status
      if (data.cached) {
        sonnerToast.success("⚡ Instant explanation loaded!");
      } else {
        sonnerToast.success("✨ AI explanation generated!");
      }

    } catch (error: any) {
      console.error('Error generating AI explanation:', error);
      toast({
        title: "⚠️ Error",
        description: error.message || "Failed to generate explanation. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Clear loading state
      setLoadingExplanations(prev => ({
        ...prev,
        [assignment.id]: {
          ...(prev[assignment.id] || {}),
          [questionIdx]: false
        }
      }));
    }
  };

  const handleRunCode = async (assignmentId: string, questionIndex: number, code: string, language: string, testCases: any[]) => {
    const executionKey = `${assignmentId}-${questionIndex}`;
    setExecutingCode(prev => ({ ...prev, [executionKey]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('execute-code', {
        body: { code, language, testCases }
      });

      if (error) throw error;

      setCodeExecutionResults(prev => ({
        ...prev,
        [executionKey]: data
      }));

      if (data.allPassed) {
        sonnerToast.success(`All ${data.totalCount} test cases passed! 🎉`);
      } else {
        sonnerToast.error(`${data.passedCount}/${data.totalCount} test cases passed`);
      }
    } catch (error: any) {
      console.error('Code execution error:', error);
      sonnerToast.error(error.message || 'Failed to execute code');
    } finally {
      setExecutingCode(prev => ({ ...prev, [executionKey]: false }));
    }
  };

  const handleSubmitQuiz = async (assignment: Assignment) => {
    const mcAnswers = selectedAnswers[assignment.id] || {};
    const textAns = textAnswers[assignment.id] || {};
    const questions = assignment.content.questions || [];
    
    // Combine both answer types
    const allAnswers: Record<number, string> = {};
    questions.forEach((q: any, idx: number) => {
      if (q.type === 'short_answer' || q.type === 'coding') {
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
      
      // Emit answer result for flow state visualization
      if (onAnswerResult && result.grade !== null) {
        const isCorrect = result.grade >= 80;
        onAnswerResult(isCorrect, result.grade);
      }
      
      // Save version history for cheat detection
      // For short answers and MCQ, check for version history data from any question
      const firstShortAnswerIdx = questions.findIndex((q: any) => q.type === 'short_answer');
      const firstQuestionIdx = 0; // For MCQ, check first question's hidden tracker
      
      // Get version history from short answer or MCQ tracker
      const versionHistoryData = firstShortAnswerIdx >= 0 
        ? textAns[`${firstShortAnswerIdx}_version_history`]
        : textAns[`${firstQuestionIdx}_version_history`];
      
      console.log('🔍 [AssignedContent] Version history details:', {
        firstShortAnswerIdx,
        firstQuestionIdx,
        hasVersionData: !!versionHistoryData,
        versionDataType: typeof versionHistoryData,
        versionDataKeys: versionHistoryData ? Object.keys(versionHistoryData) : [],
        typed_count: versionHistoryData?.typed_count,
        pasted_count: versionHistoryData?.pasted_count,
        question_copied: versionHistoryData?.question_copied,
        events_length: versionHistoryData?.events?.length,
        hasTabSwitchingData: !!tabSwitchingData,
        tab_switch_count: tabSwitchingData?.tab_switch_count
      });
      
      // ALWAYS prefer versionHistoryData if it exists (even with zero counts)
      // because it contains tab switching data
      const tabData = versionHistoryData || tabSwitchingData;

      console.log('💾 [AssignedContent] Preparing to save:', {
        hasVersionHistoryData: !!versionHistoryData,
        hasTabSwitchingData: !!tabSwitchingData,
        willSaveVersionHistory: !!(tabData && userId),
        typed_count: tabData?.typed_count || 0,
        pasted_count: tabData?.pasted_count || 0,
        tab_switch_count: tabData?.tab_switch_count || 0,
        question_copied: tabData?.question_copied || false,
        source: versionHistoryData ? 'VersionHistoryTracker' : 'TabSwitching'
      });
      
      // CRITICAL: Save version history even if typed/pasted counts are zero
      // because we still need tab switching and question copy data
      if (tabData && userId) {

        const { error: versionError } = await supabase
          .from('answer_version_history')
          .upsert({
            student_id: userId,
            assignment_id: assignment.id,
            version_events: tabData.events || [],
            typed_count: tabData.typed_count || 0,
            pasted_count: tabData.pasted_count || 0,
            question_displayed_at: tabData.question_displayed_at,
            first_interaction_at: tabData.first_interaction_at || null,
            first_interaction_type: tabData.first_interaction_type || null,
            first_interaction_size: tabData.first_interaction_size || null,
            question_copied: tabData.question_copied || false,
            question_copied_at: tabData.question_copied_at || null,
            final_answer_length: tabData.final_answer_length || 0,
            editing_events_after_first_paste: tabData.editing_events_after_first_paste || 0,
            tab_switch_count: tabData.tab_switch_count || 0,
            total_time_away_seconds: tabData.total_time_away_seconds || 0,
            tab_switches: tabData.tab_switches || [],
            longest_absence_seconds: tabData.longest_absence_seconds || 0,
            switched_away_immediately: tabData.switched_away_immediately || false,
            answer_copied: tabData.answer_copied || false,
            answer_copy_count: tabData.answer_copy_count || 0,
            answer_copy_events: tabData.answer_copy_events || [],
          }, {
            onConflict: 'student_id,assignment_id'
          });

        if (versionError) {
          console.error('❌ [AssignedContent] Failed to save version history:', {
            error: versionError,
            data: {
              typed_count: versionHistoryData?.typed_count || 0,
              pasted_count: versionHistoryData?.pasted_count || 0,
              has_events: (versionHistoryData?.events?.length || 0) > 0
            }
          });
        } else {
          console.log('✅ [AssignedContent] Version history saved successfully:', {
            typed_count: versionHistoryData?.typed_count || 0,
            pasted_count: versionHistoryData?.pasted_count || 0,
            events_count: versionHistoryData?.events?.length || 0,
            assignment_id: assignment.id
          });
        }
      }
      
      // Reset tab switching tracking after submission
      setActiveAssignmentId(null);
      resetTracking();
      
      // If there are short answers or coding questions, handle auto-grading or recommendations
      const hasCodingQuestions = questions.some((q: any) => q.type === 'coding');
      const needsGrading = result.has_short_answer || hasCodingQuestions;
      
      if (needsGrading) {
        const isAutoGrade = result.assignment_mode === 'auto_grade';
        
        toast({
          title: isAutoGrade ? "Auto-grading your answers..." : "Getting AI recommendations...",
          description: isAutoGrade ? "Please wait while we grade your responses" : "Generating recommended grades for instructor review"
        });

        let totalShortAnswerGrade = 0;
        let shortAnswerCount = 0;
        const recommendedGrades: Record<number, { grade: number; feedback: string }> = {};

        // Process short answer questions
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

        // Process coding questions if auto-grading is enabled
        if (isAutoGrade && hasCodingQuestions) {
          for (let idx = 0; idx < questions.length; idx++) {
            const q = questions[idx];
            if (q.type === 'coding') {
              const executionKey = `${assignment.id}-${idx}`;
              const executionResult = codeExecutionResults[executionKey];
              
              if (executionResult) {
                const passRate = (executionResult.passedCount / executionResult.totalCount) * 100;
                const grade = Math.round(passRate);
                
                recommendedGrades[idx] = {
                  grade,
                  feedback: executionResult.allPassed 
                    ? `All ${executionResult.totalCount} test cases passed! ✅`
                    : `${executionResult.passedCount}/${executionResult.totalCount} test cases passed (${grade}%)`
                };
              }
            }
          }
        }

        if (isAutoGrade) {
          // Use secure RPC to update grade server-side (prevents grade manipulation)
          const { data: gradeResult, error: gradeError } = await supabase
            .rpc('update_assignment_grade', {
              p_assignment_id: assignment.id,
              p_short_answer_grades: recommendedGrades
            });

          if (gradeError) {
            console.error('Failed to update grade:', gradeError);
            toast({ 
              title: "Error updating grade",
              description: "Please try again or contact your instructor.",
              variant: "destructive"
            });
            return;
          }

          const finalGrade = (gradeResult as any)?.grade;
          toast({ 
            title: "✅ Quiz Submitted Successfully!",
            description: finalGrade ? `Final grade: ${finalGrade.toFixed(1)}%` : "Your answers have been submitted."
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
    console.log('🎯 Started tab switching detection for assignment:', assignment.id, assignment.title);
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
      {/* Lecture Countdown Timer - shows when instructor has auto-questions enabled */}
      {instructorId && (
        <div className="mb-4">
          <LectureCountdownTimer instructorId={instructorId} />
        </div>
      )}

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
      
      <div className="headspace-card overflow-hidden">
      <div className="p-5 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-secondary/15 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Assigned Content</h2>
              <p className="text-sm text-muted-foreground">{assignments.filter(a => !a.completed).length} active assignment(s)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Real-time connection status indicator - ENHANCED */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
              realtimeStatus === 'connected' 
                ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800' 
                : realtimeStatus === 'connecting'
                ? 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
            }`}>
              {realtimeStatus === 'connected' ? (
                <>
                  <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Connected</span>
                </>
              ) : realtimeStatus === 'connecting' ? (
                <>
                  <Wifi className="h-4 w-4 text-yellow-600 dark:text-yellow-400 animate-pulse" />
                  <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">Connecting...</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">Disconnected</span>
                </>
              )}
            </div>
            {/* Manual refresh button */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                fetchAssignments();
              }}
              disabled={isRefreshing}
              title="Refresh assignments"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
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
                          const executionKey = `${assignment.id}-${idx}`;
                          const executionResult = codeExecutionResults[executionKey];
                          const isExecuting = executingCode[executionKey];
                          
                          // Difficulty color mapping
                          const difficultyColors = {
                            easy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
                            medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
                            hard: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
                          };
                          
                          return (
                            <div key={idx} className="border rounded-lg p-6 space-y-4">
                              {/* Header with Difficulty and Language */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-lg">Question {idx + 1}</h4>
                                  {q.difficulty && (
                                    <Badge variant="outline" className={`capitalize ${difficultyColors[q.difficulty.toLowerCase()] || 'bg-muted'}`}>
                                      {q.difficulty}
                                    </Badge>
                                  )}
                                </div>
                                {q.language && (
                                  <Badge variant="secondary" className="shrink-0">
                                    <Code2 className="w-3 h-3 mr-1" />
                                    {q.language}
                                  </Badge>
                                )}
                              </div>

                              <ScrollArea className="max-h-[600px] pr-4">
                                <div className="space-y-4">
                                  {/* Problem Statement */}
                                  <div className="space-y-2">
                                    <h5 className="font-medium text-foreground">Problem Statement</h5>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.question}</p>
                                  </div>

                                  {/* Constraints */}
                                  {q.constraints && q.constraints.length > 0 && (
                                    <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
                                      <h5 className="font-medium text-foreground flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        Constraints
                                      </h5>
                                      <ul className="space-y-1.5 text-sm">
                                        {q.constraints.map((constraint: string, cIdx: number) => {
                                          const isTimeComplexity = constraint.toLowerCase().includes('time complexity');
                                          const isSpaceComplexity = constraint.toLowerCase().includes('space complexity');
                                          
                                          return (
                                            <li key={cIdx} className="flex items-start gap-2">
                                              {isTimeComplexity && <Clock className="w-4 h-4 mt-0.5 text-primary shrink-0" />}
                                              {isSpaceComplexity && <Database className="w-4 h-4 mt-0.5 text-primary shrink-0" />}
                                              {!isTimeComplexity && !isSpaceComplexity && <span className="text-muted-foreground">•</span>}
                                              <span className={`${(isTimeComplexity || isSpaceComplexity) ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                {constraint}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Examples */}
                                  {q.examples && q.examples.length > 0 && (
                                    <div className="space-y-3">
                                      <h5 className="font-medium text-foreground flex items-center gap-2">
                                        <BookOpen className="w-4 h-4" />
                                        Examples
                                      </h5>
                                      {q.examples.map((example: any, eIdx: number) => (
                                        <div key={eIdx} className="bg-muted/30 p-3 rounded-lg space-y-2 text-sm">
                                          <p className="font-medium text-foreground">Example {eIdx + 1}:</p>
                                          <div className="space-y-1">
                                            <div>
                                              <span className="font-medium text-muted-foreground">Input: </span>
                                              <code className="bg-background px-2 py-1 rounded text-xs">{example.input}</code>
                                            </div>
                                            <div>
                                              <span className="font-medium text-muted-foreground">Output: </span>
                                              <code className="bg-background px-2 py-1 rounded text-xs">{example.output}</code>
                                            </div>
                                            {example.explanation && (
                                              <div>
                                                <span className="font-medium text-muted-foreground">Explanation: </span>
                                                <span className="text-muted-foreground">{example.explanation}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Hints (Collapsible) */}
                                  {q.hints && q.hints.length > 0 && (
                                    <Collapsible className="space-y-2">
                                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                                        <Lightbulb className="w-4 h-4" />
                                        Show Hints ({q.hints.length})
                                        <ChevronDown className="w-4 h-4" />
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="space-y-2">
                                        {q.hints.map((hint: string, hIdx: number) => (
                                          <div key={hIdx} className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <p className="text-sm text-blue-900 dark:text-blue-200">
                                              <span className="font-medium">💡 Hint {hIdx + 1}:</span> {hint}
                                            </p>
                                          </div>
                                        ))}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}

                                  {/* Function Signature */}
                                  {q.functionSignature && (
                                    <div className="space-y-2">
                                      <h5 className="font-medium text-foreground">Function Signature</h5>
                                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                        <code>{q.functionSignature}</code>
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>

                              {/* Code Editor */}
                              <div className="space-y-2 pt-2 border-t">
                                <label className="text-sm font-medium flex items-center gap-2">
                                  <Code2 className="w-4 h-4" />
                                  Your Solution:
                                </label>
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
                                  language={q.language}
                                />

                                {/* Run Code Button */}
                                {!isSubmitted && q.testCases && q.testCases.length > 0 && (
                                  <Button
                                    onClick={() => handleRunCode(assignment.id, idx, codeAnswer, q.language || 'python', q.testCases)}
                                    disabled={isExecuting || !codeAnswer.trim()}
                                    className="w-full"
                                    variant="outline"
                                  >
                                    {isExecuting ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Running Tests...
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-4 h-4 mr-2" />
                                        Run Code
                                      </>
                                    )}
                                  </Button>
                                )}

                                {/* Test Results */}
                                {executionResult && (
                                  <div className="space-y-3 border-t pt-4">
                                    <div className="flex items-center justify-between">
                                      <h5 className="font-medium text-foreground">Test Results</h5>
                                      <Badge variant={executionResult.allPassed ? "default" : "destructive"}>
                                        {executionResult.passedCount}/{executionResult.totalCount} Passed
                                      </Badge>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      {executionResult.results.map((result: any, testIdx: number) => (
                                        <div
                                          key={testIdx}
                                          className={`p-3 rounded-lg border ${
                                            result.passed
                                              ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                                              : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                                          }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            {result.passed ? (
                                              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                                            ) : (
                                              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                            )}
                                            <div className="flex-1 space-y-1 text-sm">
                                              <div className="font-medium">Test Case {testIdx + 1}</div>
                                              <div className="text-muted-foreground">
                                                <span className="font-medium">Input:</span> {result.input}
                                              </div>
                                              <div className="text-muted-foreground">
                                                <span className="font-medium">Expected:</span> {result.expectedOutput}
                                              </div>
                                              {result.actualOutput && (
                                                <div className={result.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                                                  <span className="font-medium">Actual:</span> {result.actualOutput}
                                                </div>
                                              )}
                                              {result.error && (
                                                <div className="text-red-700 dark:text-red-400 font-mono text-xs mt-1 p-2 bg-red-100 dark:bg-red-900/20 rounded">
                                                  {result.error}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
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
                            <div onCopy={(e) => {
                              // Track question copying for MCQ
                              const versionHistory = textAnswers[assignment.id]?.[`${idx}_version_history`] || {};
                              setTextAnswers(prev => ({
                                ...prev,
                                [assignment.id]: {
                                  ...(prev[assignment.id] || {}),
                                  [`${idx}_version_history`]: {
                                    ...versionHistory,
                                    question_copied: true,
                                    question_copied_at: new Date().toISOString()
                                  }
                                }
                              }));
                            }}>
                              <h4 className="font-semibold">Question {idx + 1}: {q.question}</h4>
                            </div>
                            
                            {/* Hidden tracker for cheat detection on MCQ */}
                            <div className="sr-only">
                              <VersionHistoryTracker
                                value={textAnswers[assignment.id]?.[idx] || ''}
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
                              />
                            </div>
                            
                            <div className="space-y-2">
                              {q.options?.map((opt: string, i: number) => {
                                const optionLetter = opt.trim().charAt(0).toUpperCase();
                                const normalizedSelected = selectedAnswer?.trim().toUpperCase();
                                const isSelected = normalizedSelected === optionLetter;
                                
                                // After submission and answer release, show correct/incorrect indicators
                                const studentAnswer = assignment.quiz_responses?.[idx];
                                const correctAnswer = q.correctAnswer;
                                const isCorrect = studentAnswer === correctAnswer;
                                const isThisOptionCorrect = optionLetter === correctAnswer;
                                const isStudentChoice = optionLetter === studentAnswer;
                                const showFeedback = isSubmitted && assignment.answers_released;
                                
                                return (
                                  <button
                                    key={`${idx}-${i}`}
                                    disabled={isSubmitted || (showConfidenceSelector[assignment.id] && confidenceData[assignment.id]?.locked)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAnswerSelect(assignment.id, idx, optionLetter, assignment);
                                    }}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      showFeedback && isThisOptionCorrect
                                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                                        : showFeedback && isStudentChoice && !isCorrect
                                        ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                                        : isSelected && !isSubmitted 
                                        ? 'border-primary bg-primary/5' 
                                        : 'border-border hover:border-primary/50'
                                    } ${isSubmitted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-sm flex-1">{opt}</span>
                                      {showFeedback && isThisOptionCorrect && (
                                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                                      )}
                                      {showFeedback && isStudentChoice && !isCorrect && (
                                        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            
                            {isSubmitted && !assignment.answers_released && (
                              <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                                  ✓ Submitted - Awaiting answer release
                                </p>
                              </div>
                            )}
                            
                            {isSubmitted && assignment.answers_released && (
                              <div className="space-y-3">
                                <div className={`p-3 rounded border-2 ${
                                  (assignment.quiz_responses?.[idx] === q.correctAnswer)
                                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                                }`}>
                                  <p className={`text-sm font-medium ${
                                    (assignment.quiz_responses?.[idx] === q.correctAnswer)
                                      ? 'text-green-900 dark:text-green-200'
                                      : 'text-red-900 dark:text-red-200'
                                  }`}>
                                    {(assignment.quiz_responses?.[idx] === q.correctAnswer) 
                                      ? '✓ Correct Answer' 
                                      : '✗ Incorrect Answer'}
                                  </p>
                                </div>
                                
                                {/* AI Explanation for both correct and incorrect answers */}
                                <div className="space-y-3 mt-3">
                                  {!aiExplanations[assignment.id]?.[idx] ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleGetAiExplanation(assignment, q, idx);
                                      }}
                                      disabled={loadingExplanations[assignment.id]?.[idx]}
                                      className="w-full"
                                    >
                                      {loadingExplanations[assignment.id]?.[idx] ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Generating explanation...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="w-4 h-4 mr-2" />
                                          Why? Get AI Explanation
                                        </>
                                      )}
                                    </Button>
                                  ) : (
                                    <div className="bg-primary/5 p-4 rounded-lg border-2 border-primary/20">
                                      <div className="flex items-start gap-2 mb-2">
                                        <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                        <p className="font-semibold text-primary text-sm">
                                          🎓 AI Explanation
                                        </p>
                                      </div>
                                      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                                        <ReactMarkdown>{aiExplanations[assignment.id][idx].explanation}</ReactMarkdown>
                                      </div>
                                      {aiExplanations[assignment.id][idx].cached && (
                                        <p className="text-xs text-primary/70 mt-2">
                                          ⚡ Instant response from cache
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
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
                      
                      {/* Confidence Selector for lecture check-ins */}
                      {!assignment.completed && assignment.assignment_type === 'lecture_checkin' && 
                       showConfidenceSelector[assignment.id] && !confidenceData[assignment.id]?.locked && (
                        <div className="border-t pt-4">
                          <ConfidenceSelector
                            baseReward={BASE_REWARD}
                            onSelect={(level, multiplier) => handleConfidenceSelect(assignment.id, level, multiplier)}
                          />
                        </div>
                      )}

                      {!assignment.completed && (
                        <Button 
                          onClick={() => handleSubmitQuiz(assignment)} 
                          className="w-full"
                          disabled={assignment.assignment_type === 'lecture_checkin' && 
                            showConfidenceSelector[assignment.id] && !confidenceData[assignment.id]?.locked}
                        >
                          Submit {assignment.assignment_type === 'lecture_checkin' ? 'Answer' : 'Quiz'}
                        </Button>
                      )}
                      
                      {/* Show points earned after submission for lecture check-ins */}
                      {assignment.completed && pointsEarned[assignment.id] !== undefined && (
                        <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
                          pointsEarned[assignment.id] >= 0 
                            ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                            : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
                        }`}>
                          {pointsEarned[assignment.id] >= 0 ? (
                            <TrendingUp className="h-5 w-5" />
                          ) : (
                            <TrendingDown className="h-5 w-5" />
                          )}
                          <span className="font-bold">
                            {pointsEarned[assignment.id] >= 0 ? '+' : ''}{pointsEarned[assignment.id]} XP
                          </span>
                          {confidenceData[assignment.id] && (
                            <span className="text-sm">({confidenceData[assignment.id].multiplier}x)</span>
                          )}
                        </div>
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
      </div>
    </div>
    </>
  );
};