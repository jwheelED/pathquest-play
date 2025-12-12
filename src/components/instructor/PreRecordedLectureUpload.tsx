import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Video, Loader2, CheckCircle2, AlertCircle, Brain, Play, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PreRecordedLectureUploadProps {
  onUploadComplete?: (lectureId: string) => void;
}

type UploadMode = 'file' | 'url';

export const PreRecordedLectureUpload = ({ onUploadComplete }: PreRecordedLectureUploadProps) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [professorType, setProfessorType] = useState<string | null>(null);
  const [examStyle, setExamStyle] = useState('usmle_step1');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch professor type on mount
  useEffect(() => {
    const fetchProfessorType = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('professor_type').eq('id', user.id).single();
        setProfessorType(profile?.professor_type || null);
      }
    };
    fetchProfessorType();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file');
        return;
      }
      // Check file size (500MB limit)
      if (file.size > 500 * 1024 * 1024) {
        toast.error('File size must be less than 500MB');
        return;
      }
      setSelectedFile(file);
      setStatus('idle');
      setErrorMessage('');
    }
  };

  const isValidVideoUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      // Accept YouTube, Vimeo, or direct video links
      const validHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com'];
      const isKnownHost = validHosts.some(host => parsed.hostname.includes(host));
      const isDirectVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(parsed.pathname);
      return isKnownHost || isDirectVideo || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleUpload = async () => {
    if (uploadMode === 'file' && !selectedFile) {
      toast.error('Please select a video file');
      return;
    }
    if (uploadMode === 'url' && !videoUrl.trim()) {
      toast.error('Please enter a video URL');
      return;
    }
    if (!title.trim()) {
      toast.error('Please provide a title');
      return;
    }
    if (uploadMode === 'url' && !isValidVideoUrl(videoUrl)) {
      toast.error('Please enter a valid video URL (YouTube, Vimeo, or direct link)');
      return;
    }

    try {
      setStatus('uploading');
      setUploadProgress(0);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let filePath = '';
      let externalVideoUrl: string | null = null;

      if (uploadMode === 'file' && selectedFile) {
        // Upload video to storage
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        filePath = `${user.id}/${fileName}`;

        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 10, 90));
        }, 500);

        const { error: uploadError } = await supabase.storage
          .from('lecture-videos')
          .upload(filePath, selectedFile);

        clearInterval(progressInterval);
        setUploadProgress(100);

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
      } else {
        // Using external URL
        externalVideoUrl = videoUrl.trim();
        filePath = `external-${Date.now()}`; // Placeholder path for external videos
        setUploadProgress(100);
      }

      // Create lecture video record
      const { data: lectureVideo, error: insertError } = await supabase
        .from('lecture_videos')
        .insert([{
          title: title.trim(),
          description: description.trim() || null,
          video_path: filePath,
          video_url: externalVideoUrl,
          question_count: questionCount,
          status: 'processing',
          instructor_id: user.id
        }])
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create lecture: ${insertError.message}`);
      }

      setStatus('transcribing');

      // Start transcription
      const { error: transcribeError } = await supabase.functions.invoke('transcribe-video', {
        body: {
          lectureVideoId: lectureVideo.id,
          videoPath: filePath
        }
      });

      if (transcribeError) {
        throw new Error(`Transcription failed: ${transcribeError.message}`);
      }

      setStatus('analyzing');

      // Poll for status updates
      const pollStatus = async () => {
        const { data: updated } = await supabase
          .from('lecture_videos')
          .select('status, transcript, error_message')
          .eq('id', lectureVideo.id)
          .single();

        if (updated?.status === 'analyzing' && updated.transcript) {
          // Get user profile for professor type
          const { data: profile } = await supabase
            .from('profiles')
            .select('professor_type')
            .eq('id', user.id)
            .single();

          // Trigger cognitive load analysis
          await supabase.functions.invoke('analyze-lecture-cognitive-load', {
            body: {
              lectureVideoId: lectureVideo.id,
              transcript: updated.transcript,
              questionCount,
              professorType: professorType || 'stem',
              examStyle: professorType === 'medical' ? examStyle : undefined
            }
          });

          // Poll again for final status
          setTimeout(async () => {
            const { data: final } = await supabase
              .from('lecture_videos')
              .select('status, error_message')
              .eq('id', lectureVideo.id)
              .single();

            if (final?.status === 'ready') {
              setStatus('ready');
              toast.success('Lecture processed successfully!');
              onUploadComplete?.(lectureVideo.id);
            } else if (final?.status === 'error') {
              setStatus('error');
              setErrorMessage(final.error_message || 'Processing failed');
            } else {
              // Keep polling
              setTimeout(pollStatus, 3000);
            }
          }, 5000);
        } else if (updated?.status === 'ready') {
          setStatus('ready');
          toast.success('Lecture processed successfully!');
          onUploadComplete?.(lectureVideo.id);
        } else if (updated?.status === 'error') {
          setStatus('error');
          setErrorMessage(updated.error_message || 'Processing failed');
        } else {
          // Keep polling
          setTimeout(pollStatus, 3000);
        }
      };

      setTimeout(pollStatus, 5000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setStatus('error');
      setErrorMessage(error.message);
      toast.error(error.message);
    }
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'uploading':
        return { icon: <Loader2 className="h-5 w-5 animate-spin" />, text: 'Uploading video...', color: 'bg-blue-500' };
      case 'transcribing':
        return { icon: <Loader2 className="h-5 w-5 animate-spin" />, text: 'Transcribing audio...', color: 'bg-amber-500' };
      case 'analyzing':
        return { icon: <Brain className="h-5 w-5 animate-pulse" />, text: 'Analyzing cognitive load...', color: 'bg-purple-500' };
      case 'ready':
        return { icon: <CheckCircle2 className="h-5 w-5" />, text: 'Ready for students!', color: 'bg-emerald-500' };
      case 'error':
        return { icon: <AlertCircle className="h-5 w-5" />, text: 'Error occurred', color: 'bg-red-500' };
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          Upload Pre-Recorded Lecture
        </CardTitle>
        <CardDescription>
          Upload a lecture video and AI will analyze it to insert questions at optimal learning moments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Lecture Title *</Label>
          <Input
            id="title"
            placeholder="e.g., Introduction to Machine Learning"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={status !== 'idle'}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="Brief description of the lecture content..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={status !== 'idle'}
            rows={2}
          />
        </div>

        {/* Question Count Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Number of Questions</Label>
            <Badge variant="secondary" className="font-mono">{questionCount}</Badge>
          </div>
          <Slider
            value={[questionCount]}
            onValueChange={([val]) => setQuestionCount(val)}
            min={3}
            max={20}
            step={1}
            disabled={status !== 'idle'}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            AI will identify {questionCount} optimal pause points based on cognitive load
          </p>
        </div>

        {/* Upload Mode Tabs */}
        <div className="space-y-4">
          <Label>Video Source *</Label>
          <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as UploadMode)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file" disabled={status !== 'idle'}>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </TabsTrigger>
              <TabsTrigger value="url" disabled={status !== 'idle'}>
                <Link className="h-4 w-4 mr-2" />
                Video URL
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {uploadMode === 'file' ? (
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              } ${status !== 'idle' ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={status !== 'idle'}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <Video className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP4, WebM, MOV up to 50MB (Free tier limit)
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={status !== 'idle'}
              />
              <p className="text-xs text-muted-foreground">
                Paste a YouTube, Vimeo, or direct video link. No file size limits!
              </p>
            </div>
          )}
        </div>

        {/* Progress/Status */}
        {status !== 'idle' && statusDisplay && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={statusDisplay.color}>
                {statusDisplay.icon}
                <span className="ml-1">{statusDisplay.text}</span>
              </Badge>
            </div>
            {status === 'uploading' && (
              <Progress value={uploadProgress} className="h-2" />
            )}
            {status === 'error' && errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleUpload}
          disabled={(uploadMode === 'file' && !selectedFile) || (uploadMode === 'url' && !videoUrl.trim()) || !title.trim() || status !== 'idle'}
          className="w-full"
          size="lg"
        >
          {status === 'idle' ? (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {uploadMode === 'url' ? 'Add & Process Lecture' : 'Upload & Process Lecture'}
            </>
          ) : status === 'ready' ? (
            <>
              <Play className="h-4 w-4 mr-2" />
              View Lecture
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
