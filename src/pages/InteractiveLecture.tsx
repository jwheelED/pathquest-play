import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Video, Clock, Brain, CheckCircle2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InteractiveLecturePlayer } from '@/components/student/InteractiveLecturePlayer';
import { toast } from 'sonner';

interface LectureVideo {
  id: string;
  title: string;
  description: string | null;
  video_path: string;
  duration_seconds: number | null;
  status: string;
  question_count: number;
}

interface PausePoint {
  id: string;
  pause_timestamp: number;
  cognitive_load_score: number;
  reason: string;
  question_content: any;
  question_type: string;
  order_index: number;
  is_active: boolean;
}

interface StudentProgress {
  video_position: number;
  completed_pause_points: string[];
  total_points_earned: number;
  completed_at: string | null;
}

export default function InteractiveLecture() {
  const { lectureId } = useParams<{ lectureId: string }>();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<LectureVideo | null>(null);
  const [pausePoints, setPausePoints] = useState<PausePoint[]>([]);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLecture = async () => {
      if (!lectureId) {
        setError('No lecture ID provided');
        setLoading(false);
        return;
      }

      try {
        // Fetch lecture details
        const { data: lectureData, error: lectureError } = await supabase
          .from('lecture_videos')
          .select('*')
          .eq('id', lectureId)
          .single();

        if (lectureError) throw lectureError;
        if (!lectureData) throw new Error('Lecture not found');

        setLecture(lectureData);

        // Fetch pause points
        const { data: pointsData, error: pointsError } = await supabase
          .from('lecture_pause_points')
          .select('*')
          .eq('lecture_video_id', lectureId)
          .eq('is_active', true)
          .order('order_index');

        if (pointsError) throw pointsError;
        setPausePoints(pointsData || []);

        // Fetch student progress
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: progressData } = await supabase
            .from('student_lecture_progress')
            .select('*')
            .eq('lecture_video_id', lectureId)
            .eq('student_id', user.id)
            .maybeSingle();

          setProgress(progressData);
        }

        // Get signed URL for video - handle missing files gracefully
        try {
          const { data: signedUrl, error: urlError } = await supabase.storage
            .from('lecture-videos')
            .createSignedUrl(lectureData.video_path, 3600);

          if (urlError) {
            console.error('Video file not found:', urlError);
            // Don't throw - let the page load without video
            setVideoUrl(null);
          } else {
            setVideoUrl(signedUrl.signedUrl);
          }
        } catch (storageErr) {
          console.error('Storage error:', storageErr);
          setVideoUrl(null);
        }

      } catch (err: any) {
        console.error('Error fetching lecture:', err);
        setError(err.message);
        toast.error('Failed to load lecture');
      } finally {
        setLoading(false);
      }
    };

    fetchLecture();
  }, [lectureId]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="aspect-video w-full rounded-lg" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !lecture) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Lecture</CardTitle>
              <CardDescription>{error || 'Lecture not found'}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate(-1)} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (lecture.status !== 'ready') {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                {lecture.title}
              </CardTitle>
              <CardDescription>This lecture is still being processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant="secondary" className="animate-pulse">
                Status: {lecture.status}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Please check back in a few minutes. The AI is analyzing the lecture content 
                to identify optimal learning moments.
              </p>
              <Button onClick={() => navigate(-1)} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isCompleted = !!progress?.completed_at;
  const questionsAnswered = progress?.completed_pause_points?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-semibold text-lg">{lecture.title}</h1>
                {lecture.description && (
                  <p className="text-sm text-muted-foreground">{lecture.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(lecture.duration_seconds)}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                {pausePoints.length} Questions
              </Badge>
              {isCompleted && (
                <Badge className="bg-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {videoUrl ? (
          <InteractiveLecturePlayer
            lectureId={lecture.id}
            videoUrl={videoUrl}
            title={lecture.title}
            pausePoints={pausePoints}
            onComplete={() => {
              toast.success('🎉 Congratulations! You completed the lecture!');
            }}
          />
        ) : (
          <Card className="aspect-video flex items-center justify-center border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="text-center p-6">
              <Lock className="h-12 w-12 mx-auto text-amber-500 mb-4" />
              <p className="font-medium text-amber-700 dark:text-amber-400">Video file unavailable</p>
              <p className="text-sm text-muted-foreground mt-2">
                The video file may still be processing or needs to be re-uploaded by your instructor.
              </p>
              <Button onClick={() => navigate(-1)} variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </div>
          </Card>
        )}

        {/* Progress Summary */}
        {progress && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Your Progress</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{questionsAnswered}</div>
                <div className="text-sm text-muted-foreground">Questions Answered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-500">{progress.total_points_earned}</div>
                <div className="text-sm text-muted-foreground">Points Earned</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {Math.round((questionsAnswered / pausePoints.length) * 100)}%
                </div>
                <div className="text-sm text-muted-foreground">Complete</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}