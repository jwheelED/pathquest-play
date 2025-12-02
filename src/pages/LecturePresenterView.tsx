import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLecturePresenterData } from '@/hooks/useLecturePresenterData';
import { PresenterQuestionCard } from '@/components/instructor/PresenterQuestionCard';
import { PresenterStatsBar } from '@/components/instructor/PresenterStatsBar';

export default function LecturePresenterView() {
  const navigate = useNavigate();
  const {
    studentCount,
    currentQuestion,
    recentQuestions,
    calculateQuestionStats,
    loading,
    error,
    lectureStartTime,
  } = useLecturePresenterData();

  const [lectureDuration, setLectureDuration] = useState(0);
  const [timeSinceLastQuestion, setTimeSinceLastQuestion] = useState(0);

  // Update lecture duration timer
  useEffect(() => {
    if (!lectureStartTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const duration = Math.floor((now.getTime() - lectureStartTime.getTime()) / 1000);
      setLectureDuration(duration);
    }, 1000);

    return () => clearInterval(interval);
  }, [lectureStartTime]);

  // Update time since last question
  useEffect(() => {
    if (!currentQuestion) return;

    const interval = setInterval(() => {
      const now = new Date();
      const lastQuestionTime = new Date(currentQuestion.timestamp);
      const timeSince = Math.floor((now.getTime() - lastQuestionTime.getTime()) / 1000);
      setTimeSinceLastQuestion(timeSince);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentQuestion]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading lecture data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-destructive mb-4">Error: {error}</p>
          <Button onClick={() => window.close()} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  // Calculate current question stats
  const currentStats = currentQuestion ? (() => {
    const question = currentQuestion.questions[0];
    const stats = calculateQuestionStats(currentQuestion.assignments, 0, question);
    return {
      responseCount: stats.responseCount,
      correctCount: stats.correctCount,
      correctPercentage: stats.correctPercentage,
      avgResponseTime: stats.avgResponseTime ? stats.avgResponseTime * 1000 : null, // Convert to ms
    };
  })() : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header Bar */}
      <div className="bg-card border-b border-border p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">LIVE LECTURE</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{studentCount}</span>
              <span className="text-muted-foreground">students</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{formatTime(lectureDuration)}</span>
            </div>
            <Button
              onClick={() => window.close()}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {currentQuestion && currentStats ? (
          <>
            {/* Time Since Last Question */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Time since question sent</p>
              <p className="text-3xl font-bold text-primary">{formatTime(timeSinceLastQuestion)}</p>
            </div>

            {/* Current Question */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Current Question</h2>
              <PresenterQuestionCard
                question={{
                  question_number: 1,
                  question_content: currentQuestion.questions[0],
                  sent_at: currentQuestion.timestamp,
                }}
                stats={currentStats}
                participantCount={studentCount}
              />
              <PresenterStatsBar
                stats={currentStats}
                participantCount={studentCount}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No question sent yet</h3>
            <p className="text-sm text-muted-foreground">
              Questions will appear here when you send them during the lecture
            </p>
          </div>
        )}

        {/* Recent Questions */}
        {recentQuestions.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold">Recent Questions</h2>
            <div className="space-y-3">
              {recentQuestions.map((questionGroup, index) => {
                const question = questionGroup.questions[0];
                const stats = calculateQuestionStats(questionGroup.assignments, 0, question);
                const timeAgo = Math.floor((Date.now() - new Date(questionGroup.timestamp).getTime()) / 1000);
                
                return (
                  <div key={index} className="bg-muted/30 rounded-lg p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">
                          {question.type === 'multiple_choice' ? 'Multiple Choice' : 
                           question.type === 'short_answer' ? 'Short Answer' : 'Coding'}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatTime(timeAgo)} ago</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {stats.responseCount}/{studentCount} responded
                        </p>
                        {stats.correctPercentage !== null && (
                          <p className="text-xs text-muted-foreground">
                            {Math.round(stats.correctPercentage)}% correct
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm line-clamp-2">{question.question}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Session Info */}
        {currentQuestion && (
          <div className="mt-8 pt-6 border-t border-border">
            <div className="text-center text-sm text-muted-foreground">
              <p>Lecture started at {lectureStartTime?.toLocaleTimeString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
