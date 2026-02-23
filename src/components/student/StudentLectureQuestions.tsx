import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, TrendingUp, CheckCircle, XCircle, Clock, Brain, Loader2, MessageSquare, Radio, BookOpen } from "lucide-react";

// ==================== PRE-RECORDED LECTURE RESULTS ====================

interface StudentProgress {
  id: string;
  lecture_video_id: string;
  responses: any;
  total_points_earned: number | null;
  completed_at: string | null;
  started_at: string;
  completed_pause_points: string[];
}

interface PausePoint {
  id: string;
  question_content: any;
  question_type: string;
  order_index: number;
}

interface LectureWithResponses {
  id: string;
  title: string;
  question_count: number;
  progress: StudentProgress | null;
  pausePoints: PausePoint[];
}

// ==================== LIVE LECTURE / QUIZ RESULTS ====================

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
  answers_released?: boolean;
}

interface StudentLectureQuestionsProps {
  instructorId?: string;
}

export function StudentLectureQuestions({ instructorId }: StudentLectureQuestionsProps) {
  // Pre-recorded lecture state
  const [lectures, setLectures] = useState<LectureWithResponses[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(true);
  const [expandedLecture, setExpandedLecture] = useState<string | null>(null);

  // Live/Quiz assignments state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);

  useEffect(() => {
    fetchLectureResponses();
    fetchAssignmentResults();
  }, [instructorId]);

  // ==================== FETCH PRE-RECORDED LECTURE RESULTS ====================
  const fetchLectureResponses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let lecturesQuery = supabase
        .from("lecture_videos")
        .select("id, title, question_count")
        .eq("status", "ready")
        .eq("published", true)
        .order("created_at", { ascending: false });

      if (instructorId) {
        lecturesQuery = lecturesQuery.eq("instructor_id", instructorId);
      }

      const { data: lecturesData, error: lecturesError } = await lecturesQuery;

      if (lecturesError) throw lecturesError;
      if (!lecturesData || lecturesData.length === 0) {
        setLoadingLectures(false);
        return;
      }

      const lectureIds = lecturesData.map(l => l.id);

      const { data: progressData, error: progressError } = await supabase
        .from("student_lecture_progress")
        .select("*")
        .eq("student_id", user.id)
        .in("lecture_video_id", lectureIds);

      if (progressError) throw progressError;

      const { data: pausePointsData, error: pauseError } = await supabase
        .from("lecture_pause_points")
        .select("id, lecture_video_id, question_content, question_type, order_index")
        .in("lecture_video_id", lectureIds)
        .order("order_index", { ascending: true });

      if (pauseError) throw pauseError;

      const lecturesWithResponses: LectureWithResponses[] = lecturesData.map(lecture => {
        const progress = progressData?.find(p => p.lecture_video_id === lecture.id) || null;
        const pausePoints = (pausePointsData || []).filter(pp => pp.lecture_video_id === lecture.id);

        return {
          ...lecture,
          question_count: lecture.question_count || 0,
          progress,
          pausePoints
        };
      });

      setLectures(lecturesWithResponses);
    } catch (error) {
      console.error("Error fetching lecture responses:", error);
    } finally {
      setLoadingLectures(false);
    }
  };

  // ==================== FETCH LIVE LECTURE / QUIZ RESULTS ====================
  const fetchAssignmentResults = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('student_assignments')
        .select('*')
        .eq('student_id', user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false });

      if (instructorId) {
        query = query.eq('instructor_id', instructorId);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error("Error fetching assignment results:", error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  // ==================== UTILITY FUNCTIONS ====================
  const calculateOverallScore = (progress: StudentProgress | null, pausePoints: PausePoint[]) => {
    if (!progress?.responses) return null;
    
    const responses = typeof progress.responses === 'string' 
      ? JSON.parse(progress.responses) 
      : progress.responses;
    
    let totalScore = 0;
    let questionCount = 0;

    Object.values(responses).forEach((resp: any) => {
      if (resp.grade !== undefined) {
        totalScore += resp.grade;
        questionCount++;
      } else if (resp.correct !== undefined) {
        totalScore += resp.correct ? 100 : 0;
        questionCount++;
      }
    });

    return questionCount > 0 ? Math.round(totalScore / questionCount) : null;
  };

  const getGradeColor = (grade: number | null) => {
    if (grade === null) return "text-muted-foreground";
    if (grade >= 70) return "text-emerald-600";
    if (grade >= 40) return "text-amber-600";
    return "text-red-600";
  };

  const getGradeBadgeVariant = (grade: number | null): "default" | "secondary" | "destructive" | "outline" => {
    if (grade === null) return "outline";
    if (grade >= 70) return "default";
    if (grade >= 40) return "secondary";
    return "destructive";
  };

  const getProgressPercentage = (progress: StudentProgress | null, questionCount: number) => {
    if (!progress || questionCount === 0) return 0;
    return Math.round((progress.completed_pause_points?.length || 0) / questionCount * 100);
  };

  // ==================== RENDER PRE-RECORDED LECTURE RESPONSES ====================
  const renderLectureResponses = (progress: StudentProgress | null, pausePoints: PausePoint[]) => {
    if (!progress?.responses) {
      return (
        <div className="text-center py-6 text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No responses yet</p>
          <p className="text-xs">Start watching this lecture to answer questions</p>
        </div>
      );
    }

    const responses = typeof progress.responses === 'string' 
      ? JSON.parse(progress.responses) 
      : progress.responses;

    return (
      <div className="space-y-3">
        {pausePoints.map((pp, idx) => {
          const response = responses[pp.id];
          if (!response) {
            return (
              <div key={pp.id} className="p-3 bg-muted/30 rounded-lg border border-dashed">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Q{idx + 1} • {pp.question_type}</span>
                  <Badge variant="outline" className="text-xs">Not answered</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {typeof pp.question_content === 'string' 
                    ? JSON.parse(pp.question_content).question 
                    : pp.question_content.question}
                </p>
              </div>
            );
          }

          const questionContent = typeof pp.question_content === 'string'
            ? JSON.parse(pp.question_content)
            : pp.question_content;

          const isCorrect = response.correct || (response.grade && response.grade >= 70);
          const grade = response.grade;

          return (
            <div key={pp.id} className="p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">Q{idx + 1} • {pp.question_type}</span>
                {grade !== undefined ? (
                  <Badge variant={getGradeBadgeVariant(grade)} className="text-xs">
                    {grade}%
                  </Badge>
                ) : (
                  isCorrect ? (
                    <Badge className="bg-emerald-500 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Correct
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <XCircle className="h-3 w-3 mr-1" />
                      Incorrect
                    </Badge>
                  )
                )}
              </div>
              
              <p className="text-sm font-medium mb-3">{questionContent.question}</p>
              
              <div className="space-y-2 text-sm">
                <div className="p-2 rounded bg-background">
                  <span className="text-xs text-muted-foreground block mb-1">Your Answer:</span>
                  <span className={isCorrect ? "text-emerald-600 font-medium" : "text-foreground"}>
                    {response.answer || "No answer provided"}
                  </span>
                </div>
                
                {!isCorrect && questionContent.correctAnswer && (
                  <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-xs text-muted-foreground block mb-1">Correct Answer:</span>
                    <span className="text-emerald-600 font-medium">{questionContent.correctAnswer}</span>
                  </div>
                )}

                {response.confidence && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Confidence:</span>
                    <Badge variant="outline" className="text-xs">{response.confidence}</Badge>
                  </div>
                )}

                {response.feedback && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">Feedback</span>
                    </div>
                    <p className="text-sm text-foreground">{response.feedback}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== RENDER LIVE LECTURE / QUIZ RESPONSES ====================
  const renderAssignmentResponses = (assignment: Assignment) => {
    const questions = assignment.content?.questions || [];
    const responses = assignment.quiz_responses || {};
    const aiRecommendations = responses._ai_recommendations || {};

    if (questions.length === 0) {
      return (
        <div className="text-center py-6 text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No questions in this assignment</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {questions.map((q: any, idx: number) => {
          const studentAnswer = responses[idx];
          const aiRec = aiRecommendations[idx];
          const correctAnswer = q.correctAnswer;
          const isCorrect = studentAnswer === correctAnswer || (aiRec && aiRec.grade >= 70);
          const grade = aiRec?.grade;
          const feedback = aiRec?.feedback;

          return (
            <div key={idx} className="p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">Q{idx + 1} • {q.type || 'multiple_choice'}</span>
                {grade !== undefined ? (
                  <Badge variant={getGradeBadgeVariant(grade)} className="text-xs">
                    {grade}%
                  </Badge>
                ) : correctAnswer ? (
                  isCorrect ? (
                    <Badge className="bg-emerald-500 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Correct
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <XCircle className="h-3 w-3 mr-1" />
                      Incorrect
                    </Badge>
                  )
                ) : (
                  <Badge variant="outline" className="text-xs">Submitted</Badge>
                )}
              </div>
              
              <p className="text-sm font-medium mb-3">{q.question}</p>
              
              <div className="space-y-2 text-sm">
                <div className="p-2 rounded bg-background">
                  <span className="text-xs text-muted-foreground block mb-1">Your Answer:</span>
                  <span className={isCorrect ? "text-emerald-600 font-medium" : "text-foreground"}>
                    {studentAnswer || "No answer provided"}
                  </span>
                </div>
                
                {assignment.answers_released && !isCorrect && correctAnswer && (
                  <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-xs text-muted-foreground block mb-1">Correct Answer:</span>
                    <span className="text-emerald-600 font-medium">{correctAnswer}</span>
                  </div>
                )}

                {feedback && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">Feedback</span>
                    </div>
                    <p className="text-sm text-foreground">{feedback}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== RENDER COMPONENT ====================
  const isLoading = loadingLectures || loadingAssignments;
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const completedAssignments = assignments.filter(a => a.completed);
  const lecturesWithProgress = lectures.filter(l => l.progress);
  
  const hasNoResults = lectures.length === 0 && completedAssignments.length === 0;

  if (hasNoResults) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Results
          </CardTitle>
          <CardDescription>
            Your grades and feedback will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No results yet</p>
            <p className="text-sm">Complete assignments and lectures to see your grades</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Results
        </CardTitle>
        <CardDescription>
          Your grades and feedback for all completed work
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="live" className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">Live Lectures</span>
              <span className="sm:hidden">Live</span>
              {completedAssignments.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{completedAssignments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recorded" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">Pre-Recorded</span>
              <span className="sm:hidden">Recorded</span>
              {lecturesWithProgress.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{lecturesWithProgress.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Live Lecture / Quiz Results Tab */}
          <TabsContent value="live" className="mt-0">
            {completedAssignments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No completed live lecture questions yet</p>
              </div>
            ) : (
              <Accordion type="single" collapsible value={expandedAssignment || undefined} onValueChange={setExpandedAssignment}>
                {completedAssignments.map(assignment => (
                  <AccordionItem key={assignment.id} value={assignment.id} className="border rounded-lg mb-3 px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left w-full pr-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{assignment.title}</h4>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {assignment.assignment_type === 'lecture_checkin' ? 'Live Check-in' : 'Quiz'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(assignment.created_at).toLocaleDateString()}
                            </span>
                            {assignment.grade !== null && assignment.grade !== undefined && (
                              <span className={`flex items-center gap-1 ${getGradeColor(assignment.grade)}`}>
                                <TrendingUp className="h-3 w-3" />
                                Grade: {Math.round(assignment.grade)}%
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {assignment.grade !== null && assignment.grade !== undefined && (
                          <Badge variant={getGradeBadgeVariant(assignment.grade)} className="shrink-0">
                            {Math.round(assignment.grade)}%
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    
                    <AccordionContent>
                      <div className="pt-2 pb-4">
                        {renderAssignmentResponses(assignment)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* Pre-Recorded Lecture Results Tab */}
          <TabsContent value="recorded" className="mt-0">
            {lectures.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No pre-recorded lectures available yet</p>
              </div>
            ) : (
              <Accordion type="single" collapsible value={expandedLecture || undefined} onValueChange={setExpandedLecture}>
                {lectures.map(lecture => {
                  const overallScore = calculateOverallScore(lecture.progress, lecture.pausePoints);
                  const progressPct = getProgressPercentage(lecture.progress, lecture.question_count);
                  const isCompleted = !!lecture.progress?.completed_at;
                  const isStarted = !!lecture.progress;
                  const answeredCount = lecture.progress?.completed_pause_points?.length || 0;
                  
                  return (
                    <AccordionItem key={lecture.id} value={lecture.id} className="border rounded-lg mb-3 px-4">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left w-full pr-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium truncate">{lecture.title}</h4>
                              {isCompleted && (
                                <Badge className="bg-emerald-500 shrink-0 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Complete
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Brain className="h-3 w-3" />
                                {answeredCount}/{lecture.question_count} answered
                              </span>
                              {overallScore !== null && (
                                <span className={`flex items-center gap-1 ${getGradeColor(overallScore)}`}>
                                  <TrendingUp className="h-3 w-3" />
                                  Grade: {overallScore}%
                                </span>
                              )}
                              {lecture.progress?.total_points_earned !== null && lecture.progress?.total_points_earned !== undefined && (
                                <span className="flex items-center gap-1 text-primary">
                                  {lecture.progress.total_points_earned} pts
                                </span>
                              )}
                            </div>
                            {isStarted && !isCompleted && (
                              <div className="mt-2 max-w-xs">
                                <Progress value={progressPct} className="h-1.5" />
                              </div>
                            )}
                          </div>
                          
                          {overallScore !== null && (
                            <Badge variant={getGradeBadgeVariant(overallScore)} className="shrink-0">
                              {overallScore}%
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      
                      <AccordionContent>
                        <div className="pt-2 pb-4">
                          {renderLectureResponses(lecture.progress, lecture.pausePoints)}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
