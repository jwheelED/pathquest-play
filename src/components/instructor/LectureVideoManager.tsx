import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Video, Trash2, Eye, EyeOff, Clock, Brain, RefreshCw, Settings2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  PausePointEditor, 
  PausePoint, 
  PausePointReason,
  calculateRecommendedPausePoints, 
  generateAutoPausePoints 
} from "./PausePointEditor";

interface LectureVideo {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  status: string;
  question_count: number;
  published: boolean;
  video_path: string;
  created_at: string;
}

export const LectureVideoManager = () => {
  const [lectures, setLectures] = useState<LectureVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  
  // Pause point editing state
  const [editingLecture, setEditingLecture] = useState<LectureVideo | null>(null);
  const [pausePoints, setPausePoints] = useState<PausePoint[]>([]);
  const [flowLevel, setFlowLevel] = useState(3);
  const [highYieldOnly, setHighYieldOnly] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);

  useEffect(() => {
    fetchLectures();
  }, []);

  const fetchLectures = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('lecture_videos')
        .select('*')
        .eq('instructor_id', user.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLectures(data || []);
    } catch (error) {
      console.error('Error fetching lectures:', error);
      toast.error('Failed to load lectures');
    } finally {
      setLoading(false);
    }
  };

  const togglePublished = async (lectureId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('lecture_videos')
        .update({ published: !currentValue })
        .eq('id', lectureId);

      if (error) throw error;

      setLectures(prev => 
        prev.map(l => l.id === lectureId ? { ...l, published: !currentValue } : l)
      );

      toast.success(!currentValue ? 'Lecture visible to students' : 'Lecture hidden from students');
    } catch (error) {
      console.error('Error toggling published:', error);
      toast.error('Failed to update visibility');
    }
  };

  const deleteLecture = async (lectureId: string, videoPath: string) => {
    setDeletingId(lectureId);
    try {
      // Delete from storage if it's an uploaded file (not external URL)
      if (videoPath && !videoPath.startsWith('external-')) {
        await supabase.storage.from('lecture-videos').remove([videoPath]);
      }

      // Delete related records first
      await supabase.from('lecture_pause_points').delete().eq('lecture_video_id', lectureId);
      await supabase.from('lecture_concept_map').delete().eq('lecture_video_id', lectureId);
      await supabase.from('lecture_medical_entities').delete().eq('lecture_video_id', lectureId);
      await supabase.from('student_lecture_progress').delete().eq('lecture_video_id', lectureId);
      await supabase.from('remediation_history').delete().eq('lecture_video_id', lectureId);

      // Delete the lecture video record
      const { error } = await supabase
        .from('lecture_videos')
        .delete()
        .eq('id', lectureId);

      if (error) throw error;

      setLectures(prev => prev.filter(l => l.id !== lectureId));
      toast.success('Lecture deleted successfully');
    } catch (error) {
      console.error('Error deleting lecture:', error);
      toast.error('Failed to delete lecture');
    } finally {
      setDeletingId(null);
    }
  };

  const reanalyzeLecture = async (lecture: LectureVideo) => {
    setReanalyzingId(lecture.id);
    try {
      // Fetch the transcript from the lecture
      const { data: lectureData, error: lectureError } = await supabase
        .from('lecture_videos')
        .select('transcript, question_count')
        .eq('id', lecture.id)
        .single();

      if (lectureError || !lectureData?.transcript) {
        throw new Error('Could not find transcript for this lecture');
      }

      // Delete existing pause points
      await supabase.from('lecture_pause_points').delete().eq('lecture_video_id', lecture.id);

      // Get user's profile for professor type
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('professor_type, exam_style_preference, medical_specialty')
        .eq('id', user?.id)
        .single();

      // Re-run cognitive load analysis
      const { error: analyzeError } = await supabase.functions.invoke('analyze-lecture-cognitive-load', {
        body: {
          lectureVideoId: lecture.id,
          transcript: lectureData.transcript,
          questionCount: lectureData.question_count || lecture.question_count,
          professorType: profile?.professor_type || 'stem',
          examStyle: profile?.exam_style_preference || 'usmle_step1',
          medicalSpecialty: profile?.medical_specialty || 'general'
        }
      });

      if (analyzeError) throw analyzeError;

      toast.success(`Re-analyzed "${lecture.title}" - questions regenerated`);
      
      // Refresh the list to get updated pause point counts
      fetchLectures();
    } catch (error: any) {
      console.error('Error re-analyzing lecture:', error);
      toast.error(error.message || 'Failed to re-analyze lecture');
    } finally {
      setReanalyzingId(null);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (lectures.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          Manage Lectures
        </CardTitle>
        <CardDescription>
          Control which lectures are visible to students
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lectures.map((lecture) => (
          <div
            key={lecture.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card"
          >
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate text-sm">{lecture.title}</h4>
                <Badge variant={lecture.published ? "default" : "secondary"} className="shrink-0 text-xs">
                  {lecture.published ? (
                    <><Eye className="h-3 w-3 mr-1" /> Visible</>
                  ) : (
                    <><EyeOff className="h-3 w-3 mr-1" /> Hidden</>
                  )}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(lecture.duration_seconds)}
                </span>
                <span className="flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  {lecture.question_count} questions
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {lecture.published ? 'Visible' : 'Hidden'}
                </span>
                <Switch
                  checked={lecture.published}
                  onCheckedChange={() => togglePublished(lecture.id, lecture.published)}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/instructor/preview/${lecture.id}`, '_blank')}
                className="gap-1"
              >
                <Play className="h-3.5 w-3.5" />
                Preview
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => reanalyzeLecture(lecture)}
                disabled={reanalyzingId === lecture.id}
                title="Re-analyze and regenerate questions"
              >
                <RefreshCw className={`h-4 w-4 ${reanalyzingId === lecture.id ? 'animate-spin' : ''}`} />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={deletingId === lecture.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Lecture?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{lecture.title}" and all associated student progress data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteLecture(lecture.id, lecture.video_path || '')}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
