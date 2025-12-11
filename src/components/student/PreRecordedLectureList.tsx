import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, Clock, Brain, CheckCircle2, Play, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LectureVideo {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  status: string;
  question_count: number;
  created_at: string;
}

interface StudentProgress {
  lecture_video_id: string;
  video_position: number;
  completed_pause_points: string[];
  total_points_earned: number;
  completed_at: string | null;
}

interface PreRecordedLectureListProps {
  instructorId?: string;
}

export const PreRecordedLectureList = ({ instructorId }: PreRecordedLectureListProps) => {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<LectureVideo[]>([]);
  const [progress, setProgress] = useState<Record<string, StudentProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLectures = async () => {
      try {
        let query = supabase
          .from('lecture_videos')
          .select('*')
          .eq('status', 'ready')
          .order('created_at', { ascending: false });

        if (instructorId) {
          query = query.eq('instructor_id', instructorId);
        }

        const { data: lectureData, error: lectureError } = await query;

        if (lectureError) throw lectureError;
        setLectures(lectureData || []);

        // Fetch student progress for all lectures
        const { data: { user } } = await supabase.auth.getUser();
        if (user && lectureData && lectureData.length > 0) {
          const { data: progressData } = await supabase
            .from('student_lecture_progress')
            .select('*')
            .eq('student_id', user.id)
            .in('lecture_video_id', lectureData.map(l => l.id));

          if (progressData) {
            const progressMap: Record<string, StudentProgress> = {};
            progressData.forEach(p => {
              progressMap[p.lecture_video_id] = p;
            });
            setProgress(progressMap);
          }
        }
      } catch (error) {
        console.error('Error fetching lectures:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLectures();
  }, [instructorId]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const getProgressPercentage = (lectureId: string, questionCount: number) => {
    const p = progress[lectureId];
    if (!p) return 0;
    return Math.round((p.completed_pause_points?.length || 0) / questionCount * 100);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (lectures.length === 0) {
    return null; // Don't show empty state
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          Interactive Lectures
        </CardTitle>
        <CardDescription>
          Watch lectures with built-in comprehension checkpoints
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lectures.map((lecture) => {
          const lectureProgress = progress[lecture.id];
          const progressPct = getProgressPercentage(lecture.id, lecture.question_count);
          const isCompleted = !!lectureProgress?.completed_at;
          const isStarted = !!lectureProgress;

          return (
            <div
              key={lecture.id}
              className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/lecture/${lecture.id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold truncate">{lecture.title}</h4>
                    {isCompleted && (
                      <Badge className="bg-emerald-500 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                  </div>
                  {lecture.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                      {lecture.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(lecture.duration_seconds)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Brain className="h-3 w-3" />
                      {lecture.question_count} questions
                    </span>
                    {lectureProgress && (
                      <span className="flex items-center gap-1 text-primary">
                        {lectureProgress.total_points_earned} pts earned
                      </span>
                    )}
                  </div>
                  {isStarted && !isCompleted && (
                    <div className="mt-2">
                      <Progress value={progressPct} className="h-1.5" />
                      <span className="text-xs text-muted-foreground">{progressPct}% complete</span>
                    </div>
                  )}
                </div>
                <Button size="sm" variant={isStarted ? "outline" : "default"}>
                  {isCompleted ? (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Rewatch
                    </>
                  ) : isStarted ? (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Continue
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};