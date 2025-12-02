import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, ArrowLeft } from "lucide-react";
import { usePresenterData } from "@/hooks/usePresenterData";
import { PresenterQuestionCard } from "@/components/instructor/PresenterQuestionCard";
import { PresenterStatsBar } from "@/components/instructor/PresenterStatsBar";

export default function PresenterView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionCode = searchParams.get("session");
  const [sessionTime, setSessionTime] = useState(0);
  const [timeSinceLastQuestion, setTimeSinceLastQuestion] = useState(0);

  const {
    session,
    participantCount,
    currentQuestion,
    recentQuestions,
    responseStats,
    loading,
    error
  } = usePresenterData(sessionCode);

  // Session timer
  useEffect(() => {
    if (!session?.created_at) return;
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000);
      setSessionTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.created_at]);

  // Time since last question
  useEffect(() => {
    if (!currentQuestion?.sent_at) {
      setTimeSinceLastQuestion(0);
      return;
    }
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(currentQuestion.sent_at).getTime()) / 1000);
      setTimeSinceLastQuestion(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentQuestion?.sent_at]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!sessionCode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No session code provided</p>
          <Button onClick={() => navigate("/instructor/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-destructive">Session not found or inactive</p>
          <Button onClick={() => navigate("/instructor/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <Badge variant="default" className="animate-pulse text-lg px-3 py-1">
            🔴 LIVE
          </Badge>
          <div>
            <p className="text-sm text-muted-foreground">Session Code</p>
            <p className="text-3xl font-mono font-bold">{session.session_code}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-semibold">{participantCount}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-mono font-semibold">{formatTime(sessionTime)}</span>
          </div>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate("/instructor/dashboard")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Timer Section */}
      {currentQuestion && (
        <div className="p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Time Since Question Sent</p>
              <p className="text-3xl font-mono font-bold text-primary">
                {formatTime(timeSinceLastQuestion)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Current Question */}
      {currentQuestion ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">CURRENT QUESTION</h2>
          <PresenterQuestionCard 
            question={currentQuestion}
            stats={responseStats}
            participantCount={participantCount}
          />
          <PresenterStatsBar stats={responseStats} participantCount={participantCount} />
        </div>
      ) : (
        <div className="p-8 bg-card rounded-lg border border-border text-center">
          <p className="text-muted-foreground text-lg">No question sent yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Questions will appear here when you send them
          </p>
        </div>
      )}

      {/* Recent Questions History */}
      {recentQuestions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">RECENT QUESTIONS</h2>
          <div className="space-y-2">
            {recentQuestions.map((q, idx) => (
              <div 
                key={q.id}
                className="p-3 bg-card/50 rounded-lg border border-border/50 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Q{q.question_number}: {q.question_content.question}
                  </p>
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <Badge variant="outline" className="text-xs">
                    {q.question_content.type === 'multiple_choice' ? 'MCQ' : 'Short Answer'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {q.stats.responseCount}/{participantCount}
                  </span>
                  {q.stats.correctPercentage !== null && (
                    <span className="text-sm font-semibold text-primary">
                      {Math.round(q.stats.correctPercentage)}% ✓
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session Info */}
      <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
        <p className="text-xs text-muted-foreground text-center">
          {session.title} • Started {new Date(session.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
