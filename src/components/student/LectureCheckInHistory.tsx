import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  History, CheckCircle2, XCircle, Clock, ChevronRight, 
  MessageSquare, Lightbulb, BookOpen 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MathRenderer } from "@/components/ui/math-renderer";

interface CheckInResponse {
  id: string;
  question_content: string;
  question_type: string;
  student_answer: string;
  is_correct: boolean | null;
  ai_grade: number | null;
  ai_feedback: string | null;
  submitted_at: string;
  session_code: string;
  course_title: string | null;
}

interface LectureCheckInHistoryProps {
  userId: string;
  limit?: number;
  showOnlyWrong?: boolean;
}

export function LectureCheckInHistory({ 
  userId, 
  limit = 10,
  showOnlyWrong = false 
}: LectureCheckInHistoryProps) {
  const [responses, setResponses] = useState<CheckInResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCheckInHistory();
  }, [userId, showOnlyWrong]);

  const fetchCheckInHistory = async () => {
    try {
      setLoading(true);
      
      // Get student's instructor connections
      const { data: connections } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (!connections || connections.length === 0) {
        setResponses([]);
        return;
      }

      const instructorIds = connections.map(c => c.instructor_id);

      // Get live sessions from connected instructors
      const { data: sessions } = await supabase
        .from("live_sessions")
        .select("id, session_code, instructor_id")
        .in("instructor_id", instructorIds);

      if (!sessions || sessions.length === 0) {
        setResponses([]);
        return;
      }

      const sessionIds = sessions.map(s => s.id);

      // Get check-ins from those sessions
      const { data: checkIns } = await supabase
        .from("live_session_check_ins")
        .select("id, question_content, question_type, session_id")
        .in("session_id", sessionIds);

      if (!checkIns || checkIns.length === 0) {
        setResponses([]);
        return;
      }

      const checkInIds = checkIns.map(c => c.id);

      // Get student's responses
      let responsesQuery = supabase
        .from("live_session_responses")
        .select("id, check_in_id, answer, is_correct, ai_grade, ai_feedback, submitted_at")
        .eq("student_id", userId)
        .in("check_in_id", checkInIds)
        .order("submitted_at", { ascending: false })
        .limit(limit);

      if (showOnlyWrong) {
        responsesQuery = responsesQuery.or("is_correct.eq.false,ai_grade.lt.70");
      }

      const { data: studentResponses } = await responsesQuery;

      if (!studentResponses) {
        setResponses([]);
        return;
      }

      // Get instructor course titles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, course_title")
        .in("id", instructorIds);

      const courseMap = new Map(profiles?.map(p => [p.id, p.course_title]) || []);
      const sessionMap = new Map(sessions.map(s => [s.id, { code: s.session_code, instructorId: s.instructor_id }]));
      const checkInMap = new Map(checkIns.map(c => [c.id, { content: c.question_content, type: c.question_type, sessionId: c.session_id }]));

      // Combine data
      const combinedResponses: CheckInResponse[] = studentResponses.map(r => {
        const checkIn = checkInMap.get(r.check_in_id);
        const session = checkIn ? sessionMap.get(checkIn.sessionId) : null;
        return {
          id: r.id,
          question_content: checkIn?.content || "Question unavailable",
          question_type: checkIn?.type || "unknown",
          student_answer: r.answer || "",
          is_correct: r.is_correct,
          ai_grade: r.ai_grade,
          ai_feedback: r.ai_feedback,
          submitted_at: r.submitted_at,
          session_code: session?.code || "N/A",
          course_title: session ? courseMap.get(session.instructorId) || null : null,
        };
      });

      setResponses(combinedResponses);
    } catch (error) {
      console.error("Error fetching check-in history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (response: CheckInResponse) => {
    if (response.is_correct === true || (response.ai_grade !== null && response.ai_grade >= 70)) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Correct
        </Badge>
      );
    }
    if (response.is_correct === false || (response.ai_grade !== null && response.ai_grade < 70)) {
      return (
        <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
          <XCircle className="w-3 h-3 mr-1" />
          Needs Review
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="w-5 h-5 text-primary" />
            {showOnlyWrong ? "Questions to Review" : "Recent Check-ins"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (responses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {showOnlyWrong ? (
              <>
                <Lightbulb className="w-5 h-5 text-amber-500" />
                Questions to Review
              </>
            ) : (
              <>
                <History className="w-5 h-5 text-primary" />
                Recent Check-ins
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {showOnlyWrong 
                ? "Great job! No questions need review right now."
                : "No check-in history yet. Join a live lecture to get started!"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {showOnlyWrong ? (
            <>
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Questions to Review ({responses.length})
            </>
          ) : (
            <>
              <History className="w-5 h-5 text-primary" />
              Recent Check-ins
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {responses.map((response) => (
          <div
            key={response.id}
            className={cn(
              "border rounded-lg overflow-hidden transition-all",
              expandedId === response.id ? "bg-muted/30" : "hover:bg-muted/20"
            )}
          >
            <button
              onClick={() => setExpandedId(expandedId === response.id ? null : response.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {response.course_title && (
                      <Badge variant="outline" className="text-xs">
                        {response.course_title}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(response.submitted_at)}
                    </span>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">
                    <MathRenderer content={response.question_content} />
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(response)}
                  <ChevronRight className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    expandedId === response.id && "rotate-90"
                  )} />
                </div>
              </div>
            </button>

            {expandedId === response.id && (
              <div className="px-4 pb-4 space-y-3 border-t pt-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Your Answer</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">
                    {response.student_answer || "No answer provided"}
                  </p>
                </div>
                
                {response.ai_grade !== null && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Score</p>
                    <p className="text-sm font-bold">
                      {response.ai_grade}%
                    </p>
                  </div>
                )}

                {response.ai_feedback && (
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-primary">AI Feedback</span>
                    </div>
                    <p className="text-sm text-foreground">
                      {response.ai_feedback}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
