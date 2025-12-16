import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, Video, Clock, Brain, CheckCircle2, HelpCircle, 
  MessageSquare, ChevronRight, Play, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { InteractiveLecturePlayer } from '@/components/student/InteractiveLecturePlayer';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  question_content: {
    question: string;
    options?: string[];
    correctAnswer?: string;
    expectedAnswer?: string;
    explanation?: string;
  };
  question_type: string;
  order_index: number;
  is_active: boolean;
}

export default function InstructorLecturePreview() {
  const { lectureId } = useParams<{ lectureId: string }>();
  const navigate = useNavigate();

  const [lecture, setLecture] = useState<LectureVideo | null>(null);
  const [pausePoints, setPausePoints] = useState<PausePoint[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  const handleGoBack = () => {
    navigate('/instructor/dashboard');
  };

  useEffect(() => {
    const fetchLecture = async () => {
      if (!lectureId) {
        setError('No lecture ID provided');
        setLoading(false);
        return;
      }

      try {
        // Verify user is instructor
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/instructor/auth');
          return;
        }

        // Fetch lecture details (instructor owns this lecture)
        const { data: lectureData, error: lectureError } = await supabase
          .from('lecture_videos')
          .select('*')
          .eq('id', lectureId)
          .eq('instructor_id', user.id)
          .single();

        if (lectureError) throw lectureError;
        if (!lectureData) throw new Error('Lecture not found or access denied');

        setLecture(lectureData);

        // Fetch pause points
        const { data: pointsData, error: pointsError } = await supabase
          .from('lecture_pause_points')
          .select('*')
          .eq('lecture_video_id', lectureId)
          .order('order_index');

        if (pointsError) throw pointsError;
        setPausePoints((pointsData || []) as unknown as PausePoint[]);

        // Get signed URL for video
        if (lectureData.video_path && !lectureData.video_path.startsWith('external-')) {
          const { data: signedUrl, error: urlError } = await supabase.storage
            .from('lecture-videos')
            .createSignedUrl(lectureData.video_path, 3600);

          if (!urlError && signedUrl) {
            setVideoUrl(signedUrl.signedUrl);
          }
        } else if (lectureData.video_url) {
          setVideoUrl(lectureData.video_url);
        }

      } catch (err: any) {
        console.error('Error fetching lecture:', err);
        setError(err.message);
        toast.error('Failed to load lecture preview');
      } finally {
        setLoading(false);
      }
    };

    fetchLecture();
  }, [lectureId, navigate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="aspect-video w-full rounded-lg lg:col-span-2" />
            <Skeleton className="h-96 w-full rounded-lg" />
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
              <CardTitle className="text-destructive">Error Loading Preview</CardTitle>
              <CardDescription>{error || 'Lecture not found'}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGoBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleGoBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold text-lg">{lecture.title}</h1>
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                    Instructor Preview
                  </Badge>
                </div>
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
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-2">
            {videoUrl ? (
              <InteractiveLecturePlayer
                lectureId={lecture.id}
                videoUrl={videoUrl}
                title={lecture.title}
                pausePoints={pausePoints}
                isPreview={true}
                onQuestionSelect={setSelectedQuestionId}
              />
            ) : (
              <Card className="aspect-video flex items-center justify-center border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <div className="text-center p-6">
                  <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                  <p className="font-medium text-amber-700 dark:text-amber-400">Video unavailable</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    The video file may need to be re-uploaded.
                  </p>
                </div>
              </Card>
            )}
          </div>

          {/* Question Review Panel */}
          <div className="lg:col-span-1">
            <Card className="h-fit max-h-[calc(100vh-200px)] flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Question Review
                </CardTitle>
                <CardDescription>
                  {pausePoints.length} pause points configured
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-[500px]">
                  <div className="p-4 space-y-3">
                    {pausePoints.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No questions configured</p>
                      </div>
                    ) : (
                      pausePoints.map((point, idx) => (
                        <Card 
                          key={point.id}
                          className={cn(
                            "cursor-pointer transition-all hover:border-primary/50",
                            selectedQuestionId === point.id && "border-primary bg-primary/5"
                          )}
                          onClick={() => setSelectedQuestionId(point.id)}
                        >
                          <CardContent className="p-3 space-y-2">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  Q{idx + 1}
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs",
                                    point.question_type === 'multiple_choice' 
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                      : "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                  )}
                                >
                                  {point.question_type === 'multiple_choice' ? 'MCQ' : 'Short Answer'}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Play className="h-3 w-3" />
                                {formatTime(point.pause_timestamp)}
                              </span>
                            </div>

                            {/* Question text */}
                            <p className="text-sm font-medium line-clamp-2">
                              {point.question_content.question}
                            </p>

                            {/* Reason tag */}
                            {point.reason && (
                              <Badge variant="outline" className="text-xs bg-muted/50">
                                {point.reason}
                              </Badge>
                            )}

                            {/* Cognitive load */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Brain className="h-3 w-3" />
                              Cognitive Load: {point.cognitive_load_score}/10
                            </div>

                            {/* Expanded details when selected */}
                            {selectedQuestionId === point.id && (
                              <div className="pt-3 border-t mt-3 space-y-3">
                                {/* Options for MCQ */}
                                {point.question_type === 'multiple_choice' && point.question_content.options && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Options:</p>
                                    {point.question_content.options.map((opt, i) => (
                                      <div 
                                        key={i}
                                        className={cn(
                                          "text-xs p-2 rounded border",
                                          opt.startsWith(point.question_content.correctAnswer || '') 
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                            : "bg-muted/30"
                                        )}
                                      >
                                        {opt}
                                        {opt.startsWith(point.question_content.correctAnswer || '') && (
                                          <CheckCircle2 className="h-3 w-3 inline ml-1" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Correct/Expected answer */}
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {point.question_type === 'multiple_choice' ? 'Correct Answer:' : 'Expected Answer:'}
                                  </p>
                                  <p className="text-xs p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                                    {point.question_content.correctAnswer || point.question_content.expectedAnswer || 'Not specified'}
                                  </p>
                                </div>

                                {/* Explanation */}
                                {point.question_content.explanation && (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Explanation:</p>
                                    <p className="text-xs p-2 rounded bg-muted/50 border">
                                      {point.question_content.explanation}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
