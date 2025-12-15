import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { Video, Users, TrendingUp, CheckCircle, XCircle, Clock, Sparkles, ChevronDown, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface StudentProgress {
  id: string;
  student_id: string;
  lecture_video_id: string;
  responses: any;
  total_points_earned: number | null;
  completed_at: string | null;
  started_at: string;
  student_name: string;
}

interface PausePoint {
  id: string;
  question_content: any;
  question_type: string;
  order_index: number;
}

interface LectureWithGrades {
  id: string;
  title: string;
  question_count: number;
  studentProgress: StudentProgress[];
  pausePoints: PausePoint[];
}

export function PreRecordedLectureGrades() {
  const [lectures, setLectures] = useState<LectureWithGrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLecture, setExpandedLecture] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<{ [lectureId: string]: string }>({});
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);

  useEffect(() => {
    fetchLectureGrades();
  }, []);

  const fetchLectureGrades = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch instructor's lectures
      const { data: lecturesData, error: lecturesError } = await supabase
        .from("lecture_videos")
        .select("id, title, question_count")
        .eq("instructor_id", user.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false });

      if (lecturesError) throw lecturesError;
      if (!lecturesData || lecturesData.length === 0) {
        setLoading(false);
        return;
      }

      const lectureIds = lecturesData.map(l => l.id);

      // Fetch all student progress for these lectures
      const { data: progressData, error: progressError } = await supabase
        .from("student_lecture_progress")
        .select("*")
        .in("lecture_video_id", lectureIds);

      if (progressError) throw progressError;

      // Fetch pause points for question reference
      const { data: pausePointsData, error: pauseError } = await supabase
        .from("lecture_pause_points")
        .select("id, lecture_video_id, question_content, question_type, order_index")
        .in("lecture_video_id", lectureIds)
        .order("order_index", { ascending: true });

      if (pauseError) throw pauseError;

      // Fetch student names
      const studentIds = [...new Set(progressData?.map(p => p.student_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", studentIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p.full_name || "Student"]) || []);

      // Organize data by lecture
      const lecturesWithGrades: LectureWithGrades[] = lecturesData.map(lecture => {
        const studentProgress = (progressData || [])
          .filter(p => p.lecture_video_id === lecture.id)
          .map(p => ({
            ...p,
            student_name: profilesMap.get(p.student_id) || "Student"
          }));

        const pausePoints = (pausePointsData || [])
          .filter(pp => pp.lecture_video_id === lecture.id);

        return {
          ...lecture,
          question_count: lecture.question_count || 0,
          studentProgress,
          pausePoints
        };
      });

      // Only show lectures with at least one student progress entry
      setLectures(lecturesWithGrades.filter(l => l.studentProgress.length > 0));
    } catch (error) {
      console.error("Error fetching lecture grades:", error);
      toast.error("Failed to load lecture grades");
    } finally {
      setLoading(false);
    }
  };

  const calculateLectureStats = (lecture: LectureWithGrades) => {
    const totalStudents = lecture.studentProgress.length;
    const completedStudents = lecture.studentProgress.filter(p => p.completed_at).length;
    
    let totalGrades = 0;
    let gradeCount = 0;

    lecture.studentProgress.forEach(progress => {
      if (progress.responses) {
        const responses = typeof progress.responses === 'string' 
          ? JSON.parse(progress.responses) 
          : progress.responses;
        
        Object.values(responses).forEach((resp: any) => {
          if (resp.grade !== undefined) {
            totalGrades += resp.grade;
            gradeCount++;
          } else if (resp.correct !== undefined) {
            totalGrades += resp.correct ? 100 : 0;
            gradeCount++;
          }
        });
      }
    });

    const avgGrade = gradeCount > 0 ? Math.round(totalGrades / gradeCount) : null;

    return { totalStudents, completedStudents, avgGrade };
  };

  const getStudentOverallScore = (progress: StudentProgress, pausePoints: PausePoint[]) => {
    if (!progress.responses) return null;
    
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

  const generateAISummary = async (lecture: LectureWithGrades) => {
    setGeneratingSummary(lecture.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-lecture-grades-summary', {
        body: {
          lectureId: lecture.id,
          lectureTitle: lecture.title,
          studentProgress: lecture.studentProgress,
          pausePoints: lecture.pausePoints
        }
      });

      if (error) throw error;

      setAiSummary(prev => ({
        ...prev,
        [lecture.id]: data.summary
      }));

      toast.success("AI summary generated!");
    } catch (error) {
      console.error("Error generating AI summary:", error);
      toast.error("Failed to generate AI summary");
    } finally {
      setGeneratingSummary(null);
    }
  };

  const renderStudentResponses = (progress: StudentProgress, pausePoints: PausePoint[]) => {
    if (!progress.responses) {
      return <p className="text-sm text-muted-foreground">No responses recorded</p>;
    }

    const responses = typeof progress.responses === 'string' 
      ? JSON.parse(progress.responses) 
      : progress.responses;

    return (
      <div className="space-y-3 mt-2">
        {pausePoints.map((pp, idx) => {
          const response = responses[pp.id];
          if (!response) return null;

          const questionContent = typeof pp.question_content === 'string'
            ? JSON.parse(pp.question_content)
            : pp.question_content;

          const isCorrect = response.correct || (response.grade && response.grade >= 70);
          const grade = response.grade;

          return (
            <div key={pp.id} className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">Q{idx + 1} • {pp.question_type}</span>
                {grade !== undefined ? (
                  <Badge variant={getGradeBadgeVariant(grade)} className="text-xs">
                    {grade}%
                  </Badge>
                ) : (
                  isCorrect ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )
                )}
              </div>
              
              <p className="text-sm font-medium mb-2">{questionContent.question}</p>
              
              <div className="space-y-1 text-sm">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Answer:</span>
                  <span className={isCorrect ? "text-emerald-600" : "text-red-600"}>
                    {response.answer || "No answer"}
                  </span>
                </div>
                
                {!isCorrect && questionContent.correctAnswer && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Expected:</span>
                    <span className="text-emerald-600">{questionContent.correctAnswer}</span>
                  </div>
                )}

                {response.confidence && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Confidence:</span>
                    <span>{response.confidence}</span>
                  </div>
                )}

                {response.feedback && (
                  <div className="mt-2 p-2 bg-background rounded text-xs">
                    <span className="text-muted-foreground">AI Feedback: </span>
                    {response.feedback}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (lectures.length === 0) {
    return null; // Don't show card if no lectures with progress
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Pre-Recorded Lecture Grades
          </CardTitle>
          <CardDescription>
            View student performance on pre-recorded lecture questions
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLectureGrades} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible value={expandedLecture || undefined} onValueChange={setExpandedLecture}>
          {lectures.map(lecture => {
            const stats = calculateLectureStats(lecture);
            
            return (
              <AccordionItem key={lecture.id} value={lecture.id} className="border rounded-lg mb-3 px-4">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left w-full pr-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{lecture.title}</h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {stats.completedStudents}/{stats.totalStudents} completed
                        </span>
                        {stats.avgGrade !== null && (
                          <span className={`flex items-center gap-1 ${getGradeColor(stats.avgGrade)}`}>
                            <TrendingUp className="h-3 w-3" />
                            Avg: {stats.avgGrade}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                
                <AccordionContent>
                  <div className="pt-2 pb-4 space-y-4">
                    {/* AI Summary Section */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateAISummary(lecture)}
                        disabled={generatingSummary === lecture.id}
                      >
                        {generatingSummary === lecture.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        {aiSummary[lecture.id] ? "Regenerate AI Summary" : "Generate AI Summary"}
                      </Button>
                    </div>

                    {aiSummary[lecture.id] && (
                      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                        <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          AI Performance Analysis
                        </h5>
                        <div className="prose prose-sm max-w-none text-sm">
                          <ReactMarkdown>{aiSummary[lecture.id]}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Student List - with proper scrolling */}
                    <div className="h-[400px] overflow-y-auto border rounded-lg p-2">
                      <Accordion type="multiple" className="space-y-2">
                        {lecture.studentProgress.map(progress => {
                          const overallScore = getStudentOverallScore(progress, lecture.pausePoints);
                          
                          return (
                            <AccordionItem 
                              key={progress.id} 
                              value={progress.id}
                              className="border rounded-lg px-3"
                            >
                              <AccordionTrigger className="hover:no-underline py-3">
                                <div className="flex items-center justify-between w-full pr-2">
                                  <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <span className="text-xs font-medium text-primary">
                                        {progress.student_name.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="text-left">
                                      <p className="font-medium text-sm">{progress.student_name}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {progress.completed_at ? (
                                          <span className="flex items-center gap-1 text-emerald-600">
                                            <CheckCircle className="h-3 w-3" />
                                            Completed
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 text-amber-600">
                                            <Clock className="h-3 w-3" />
                                            In Progress
                                          </span>
                                        )}
                                        {progress.total_points_earned !== null && (
                                          <span>• {progress.total_points_earned} pts</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {overallScore !== null && (
                                    <Badge variant={getGradeBadgeVariant(overallScore)}>
                                      {overallScore}%
                                    </Badge>
                                  )}
                                </div>
                              </AccordionTrigger>
                              
                              <AccordionContent>
                                {renderStudentResponses(progress, lecture.pausePoints)}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
