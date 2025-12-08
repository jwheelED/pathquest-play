import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SlideUploader } from '@/components/instructor/slides/SlideUploader';
import { SlideViewer } from '@/components/instructor/slides/SlideViewer';
import { SlidePresenterOverlay } from '@/components/instructor/slides/SlidePresenterOverlay';
import { SlideRecordingControls } from '@/components/instructor/slides/SlideRecordingControls';
import { useLectureRecording } from '@/hooks/useLectureRecording';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Presentation, Upload } from 'lucide-react';
import { toast } from 'sonner';

export interface SlideData {
  id: string;
  title: string;
  slides: string[]; // Array of image URLs
  totalSlides: number;
  createdAt: string;
}

export default function SlidePresenter() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [presentations, setPresentations] = useState<SlideData[]>([]);
  const [activePresentation, setActivePresentation] = useState<SlideData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Track current slide text for context
  const [currentSlideText, setCurrentSlideText] = useState<string>('');
  const [currentSlideNumber, setCurrentSlideNumber] = useState<number>(1);

  // Integrate lecture recording hook with slide context
  const {
    isRecording,
    recordingDuration,
    studentCount,
    autoQuestionEnabled,
    autoQuestionInterval,
    nextAutoQuestionIn,
    isSendingQuestion,
    voiceCommandDetected,
    startRecording,
    stopRecording,
    handleManualQuestionSend,
    handleTestAutoQuestion,
    toggleAutoQuestion,
  } = useLectureRecording({
    onQuestionGenerated: () => {
      console.log('Question generated from slide presenter');
    },
    slideContext: currentSlideText,
  });

  // Handle slide change - receive text from SlideViewer
  const handleSlideChange = useCallback((slideText: string, pageNumber: number) => {
    setCurrentSlideText(slideText);
    setCurrentSlideNumber(pageNumber);
    console.log(`📑 Slide context updated: page ${pageNumber}, ${slideText.length} chars`);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/instructor/auth');
        return;
      }
      setIsAuthenticated(true);
      await fetchPresentations();
      setLoading(false);
    };
    checkAuth();
  }, [navigate]);

  const fetchPresentations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch PDF materials that can be presented
    const { data, error } = await supabase
      .from('lecture_materials')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('file_type', 'application/pdf')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching presentations:', error);
      return;
    }

    // Convert to SlideData format (we'll generate slide URLs on-demand)
    const slides: SlideData[] = (data || []).map((m) => ({
      id: m.id,
      title: m.title,
      slides: [], // Will be populated when presenting
      totalSlides: 0,
      createdAt: m.created_at,
    }));

    setPresentations(slides);
  };

  const handleStartPresentation = async (presentation: SlideData) => {
    setActivePresentation(presentation);
    setIsFullscreen(true);
    setCurrentSlideText('');
    setCurrentSlideNumber(1);
    
    // Enter browser fullscreen
    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      console.log('Fullscreen not available');
    }
  };

  const handleExitPresentation = useCallback(() => {
    setIsFullscreen(false);
    setActivePresentation(null);
    setCurrentSlideText('');
    setCurrentSlideNumber(1);
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleUploadComplete = () => {
    setShowUploader(false);
    fetchPresentations();
    toast.success('Slides uploaded successfully!');
  };

  // Handle ESC key to exit presentation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleExitPresentation();
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        handleExitPresentation();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, handleExitPresentation]);

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Fullscreen presentation mode with integrated recording
  if (isFullscreen && activePresentation) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <SlideViewer
          presentationId={activePresentation.id}
          title={activePresentation.title}
          onExit={handleExitPresentation}
          onSlideChange={handleSlideChange}
        />
        
        {/* Recording Controls - bottom left */}
        <SlideRecordingControls
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          studentCount={studentCount}
          autoQuestionEnabled={autoQuestionEnabled}
          nextAutoQuestionIn={nextAutoQuestionIn}
          autoQuestionInterval={autoQuestionInterval}
          isSendingQuestion={isSendingQuestion}
          voiceCommandDetected={voiceCommandDetected}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onManualSend={handleManualQuestionSend}
          onToggleAutoQuestion={toggleAutoQuestion}
          onTestAutoQuestion={handleTestAutoQuestion}
        />
        
        {/* Stats Overlay - top right (receives state via BroadcastChannel) */}
        <SlidePresenterOverlay
          directState={{
            isRecording,
            recordingDuration,
            studentCount,
            autoQuestionEnabled,
            nextAutoQuestionIn,
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/instructor/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Presentation className="h-5 w-5 text-primary" />
                Slide Presenter
              </h1>
              <p className="text-sm text-muted-foreground">
                Present slides with integrated live lecture tools
              </p>
            </div>
          </div>
          <Button onClick={() => setShowUploader(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Slides
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {showUploader ? (
          <SlideUploader
            onComplete={handleUploadComplete}
            onCancel={() => setShowUploader(false)}
          />
        ) : presentations.length === 0 ? (
          <div className="text-center py-16">
            <Presentation className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Presentations Yet</h2>
            <p className="text-muted-foreground mb-6">
              Upload PDF slides to start presenting with integrated live lecture tools
            </p>
            <Button onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Your First Slides
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((presentation) => (
              <div
                key={presentation.id}
                className="border rounded-lg overflow-hidden bg-card hover:border-primary/50 transition-colors cursor-pointer group"
                onClick={() => handleStartPresentation(presentation)}
              >
                <div className="aspect-video bg-muted flex items-center justify-center relative">
                  <Presentation className="h-12 w-12 text-muted-foreground" />
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button variant="secondary">
                      Start Presenting
                    </Button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold truncate">{presentation.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(presentation.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}