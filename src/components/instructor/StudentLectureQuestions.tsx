import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Clock, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StudentQuestion {
  id: string;
  lecture_video_id: string;
  student_id: string;
  question_text: string;
  video_timestamp_seconds: number | null;
  is_answered: boolean;
  instructor_reply: string | null;
  created_at: string;
  lecture_title?: string;
  student_name?: string;
}

function formatTimestamp(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `at ${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function StudentLectureQuestions({ instructorId }: { instructorId: string }) {
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from('student_lecture_questions' as any) as any)
      .select(`
        id,
        lecture_video_id,
        student_id,
        question_text,
        video_timestamp_seconds,
        is_answered,
        instructor_reply,
        created_at,
        lecture_videos!lecture_video_id(title),
        profiles!student_id(full_name)
      `)
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[StudentLectureQuestions] fetch error:', error);
    } else if (data) {
      const mapped: StudentQuestion[] = data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        lecture_video_id: row.lecture_video_id as string,
        student_id: row.student_id as string,
        question_text: row.question_text as string,
        video_timestamp_seconds: row.video_timestamp_seconds as number | null,
        is_answered: row.is_answered as boolean,
        instructor_reply: row.instructor_reply as string | null,
        created_at: row.created_at as string,
        lecture_title: (row.lecture_videos as { title?: string } | null)?.title ?? 'Unknown Lecture',
        student_name: (row.profiles as { full_name?: string } | null)?.full_name ?? 'Student',
      }));
      setQuestions(mapped);
    }
    setLoading(false);
  }, [instructorId]);

  useEffect(() => {
    fetchQuestions();

    // Realtime subscription for new questions
    const channel = supabase
      .channel(`student-questions-${instructorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_lecture_questions',
          filter: `instructor_id=eq.${instructorId}`,
        },
        () => { fetchQuestions(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [instructorId, fetchQuestions]);

  const handleReply = async (questionId: string) => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('student_lecture_questions')
      .update({
        instructor_reply: replyText.trim(),
        replied_at: new Date().toISOString(),
        is_answered: true,
      })
      .eq('id', questionId);

    if (error) {
      toast.error('Failed to send reply');
    } else {
      toast.success('Reply sent to student');
      setReplyingTo(null);
      setReplyText('');
      fetchQuestions();
    }
    setSubmitting(false);
  };

  const unanswered = questions.filter((q) => !q.is_answered);
  const answered = questions.filter((q) => q.is_answered);

  // Group unanswered by lecture title
  const byLecture: Record<string, StudentQuestion[]> = {};
  for (const q of unanswered) {
    const title = q.lecture_title ?? 'Unknown Lecture';
    if (!byLecture[title]) byLecture[title] = [];
    byLecture[title].push(q);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Student Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading questions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Student Questions
            {unanswered.length > 0 && (
              <Badge className="bg-red-500 text-white ml-1">{unanswered.length}</Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {unanswered.length === 0 && (
          <p className="text-muted-foreground text-sm">No unanswered questions.</p>
        )}

        {Object.entries(byLecture).map(([lectureTitle, qs]) => (
          <div key={lectureTitle} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {lectureTitle}
            </h3>
            {qs.map((q) => (
              <div
                key={q.id}
                className="border rounded-lg p-4 space-y-3 bg-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{q.student_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      {timeAgo(q.created_at)}
                      {q.video_timestamp_seconds !== null && (
                        <span className="italic">{formatTimestamp(q.video_timestamp_seconds)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm">{q.question_text}</p>

                {replyingTo === q.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Type your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleReply(q.id)}
                        disabled={submitting || !replyText.trim()}
                      >
                        Send Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReplyingTo(null); setReplyText(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setReplyingTo(q.id); setReplyText(''); }}
                  >
                    Reply
                  </Button>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Answered questions collapsible section */}
        {answered.length > 0 && (
          <div>
            <button
              onClick={() => setShowAnswered((v) => !v)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAnswered ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {answered.length} answered question{answered.length !== 1 ? 's' : ''}
            </button>
            {showAnswered && (
              <div className="mt-3 space-y-3">
                {answered.map((q) => (
                  <div
                    key={q.id}
                    className={cn("border rounded-lg p-4 space-y-2 bg-muted/30 opacity-80")}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">{q.student_name}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(q.created_at)}</span>
                      {q.video_timestamp_seconds !== null && (
                        <span className="text-xs text-muted-foreground italic">
                          {formatTimestamp(q.video_timestamp_seconds)}
                        </span>
                      )}
                      {q.lecture_title && (
                        <Badge variant="outline" className="text-xs">{q.lecture_title}</Badge>
                      )}
                    </div>
                    <p className="text-sm">{q.question_text}</p>
                    {q.instructor_reply && (
                      <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3 italic">
                        {q.instructor_reply}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
