import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCourseContext } from '@/hooks/useCourseContext';
import { SlideUploader } from '@/components/instructor/slides/SlideUploader';
import { SlideViewer, SlideViewerRef } from '@/components/instructor/slides/SlideViewer';
import { PptxViewer, PptxViewerRef } from '@/components/instructor/slides/PptxViewer';
import { SlidePresenterOverlay } from '@/components/instructor/slides/SlidePresenterOverlay';
import { SlideRecordingControls, SlideQuestionType } from '@/components/instructor/slides/SlideRecordingControls';
import { SlideQuestionPreviewDialog, ExtractedQuestionData, QuestionType } from '@/components/instructor/slides/SlideQuestionPreviewDialog';
import { VoiceQuestionPreviewDialog, ExtractedVoiceQuestion } from '@/components/instructor/VoiceQuestionPreviewDialog';
import { useLectureRecording } from '@/hooks/useLectureRecording';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Presentation, Upload, Mic, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { playNotificationSound } from '@/lib/audioNotification';
import { cn } from '@/lib/utils';
import { trackQuestionSent, trackSlidePresenterStarted } from '@/lib/posthogTracking';

export interface SlideData {
  id: string;
  title: string;
  slides: string[];
  totalSlides: number;
  createdAt: string;
  fileType: string;
}

export default function SlidePresenter() {
  const navigate = useNavigate();
  const { selectedCourseId } = useCourseContext();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [presentations, setPresentations] = useState<SlideData[]>([]);
  const [activePresentation, setActivePresentation] = useState<SlideData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [extractionStage, setExtractionStage] = useState<'idle' | 'capturing' | 'analyzing' | 'sending'>('idle');
  
  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  
  // Slide question preview dialog state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewQuestionType, setPreviewQuestionType] = useState<QuestionType>('mcq');
  const [previewExtractedData, setPreviewExtractedData] = useState<ExtractedQuestionData | null>(null);
  const [isSendingFromPreview, setIsSendingFromPreview] = useState(false);
  
  // Voice question preview dialog state
  const [isVoicePreviewOpen, setIsVoicePreviewOpen] = useState(false);
  const [voicePreviewData, setVoicePreviewData] = useState<ExtractedVoiceQuestion | null>(null);
  const [isSendingVoiceQuestion, setIsSendingVoiceQuestion] = useState(false);
  
  // Ref to SlideViewer for capturing slide image
  const slideViewerRef = useRef<SlideViewerRef>(null);
  
  // Track current slide text for context
  const [currentSlideText, setCurrentSlideText] = useState<string>('');
  const [currentSlideNumber, setCurrentSlideNumber] = useState<number>(1);

  // Refs to hold callbacks
  const handleManualQuestionSendRef = useRef<(() => Promise<void>) | null>(null);
  const handleSendSlideQuestionRef = useRef<((type: SlideQuestionType, skipPreview?: boolean) => Promise<void>) | null>(null);
  
  // Guard ref to prevent duplicate voice command triggers
  const isProcessingSlideQuestionRef = useRef(false);

  // Handle voice commands from lecture recording
  const handleVoiceCommand = useCallback((type: 'send_question' | 'send_slide_question') => {
    console.log(`🎤 Slide Presenter received voice command: ${type}`);
    
    if (type === 'send_slide_question' && isProcessingSlideQuestionRef.current) {
      console.log('⚠️ Skipping duplicate slide question trigger - already processing');
      return;
    }
    
    playNotificationSound().catch(() => {});
    
    if (type === 'send_slide_question') {
      isProcessingSlideQuestionRef.current = true;
      toast.success('Voice command: Send Slide Question');
      handleSendSlideQuestionRef.current?.('mcq', false);
    } else if (type === 'send_question') {
      toast.success('Voice command: Send Question');
      setTimeout(() => {
        handleManualQuestionSendRef.current?.();
      }, 500);
    }
  }, []);

  // Handle extracted voice question
  const handleQuestionExtracted = useCallback((data: ExtractedVoiceQuestion) => {
    console.log('📋 Voice question extracted, opening preview:', data);
    setVoicePreviewData(data);
    setIsVoicePreviewOpen(true);
  }, []);

  // Integrate lecture recording hook
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
    sendExtractedQuestion,
  } = useLectureRecording({
    onQuestionGenerated: () => {
      console.log('Question generated from slide presenter');
    },
    slideContext: currentSlideText,
    onVoiceCommand: handleVoiceCommand,
    onQuestionExtracted: handleQuestionExtracted,
    bypassPreviewSetting: true,
    courseId: selectedCourseId || undefined,
  });

  useEffect(() => {
    handleManualQuestionSendRef.current = handleManualQuestionSend;
  }, [handleManualQuestionSend]);

  const handleSlideChange = useCallback((slideText: string, pageNumber: number) => {
    setCurrentSlideText(slideText);
    setCurrentSlideNumber(pageNumber);
  }, []);

  const handleToggleSelectionMode = useCallback(() => {
    if (isSelectionMode) {
      slideViewerRef.current?.clearSelection();
      setHasSelection(false);
    }
    setIsSelectionMode(!isSelectionMode);
  }, [isSelectionMode]);

  const handleClearSelection = useCallback(() => {
    slideViewerRef.current?.clearSelection();
    setHasSelection(false);
  }, []);

  const handleSelectionChange = useCallback((selected: boolean) => {
    setHasSelection(selected);
    if (selected) setIsSelectionMode(false);
  }, []);

  // Handle confirming and sending the question from preview dialog
  const handleConfirmSendQuestion = useCallback(async (editedData: ExtractedQuestionData, isPollMode: boolean) => {
    setIsSendingFromPreview(true);
    
    try {
      await supabase.auth.refreshSession();
      
      const { data: sendData, error: sendError } = await supabase.functions.invoke('send-slide-question', {
        body: {
          questionType: previewQuestionType,
          extractedQuestion: editedData,
          slideNumber: currentSlideNumber,
          isPollMode,
          course_id: selectedCourseId,
        },
      });

      if (sendError) {
        toast.error(sendError.message || 'Failed to send question to students');
        return;
      }

      if (!sendData?.success) {
        toast.error(sendData?.error || 'Failed to send question');
        return;
      }

      trackQuestionSent(previewQuestionType, 'slide');
      const modeLabel = isPollMode ? 'Poll' : previewQuestionType.toUpperCase();
      toast.success(`${modeLabel} sent to students!`);
      setIsPreviewOpen(false);
      setPreviewExtractedData(null);
    } catch (err) {
      console.error('Error in handleConfirmSendQuestion:', err);
      toast.error('An error occurred while sending the question');
    } finally {
      setIsSendingFromPreview(false);
      isProcessingSlideQuestionRef.current = false;
    }
  }, [previewQuestionType, currentSlideNumber, selectedCourseId]);

  // Handle sending a question from the current slide via OCR
  const handleSendSlideQuestion = useCallback(async (questionType: SlideQuestionType, skipPreview: boolean = false) => {
    if (!slideViewerRef.current) {
      toast.error('Slide viewer not ready');
      return;
    }

    setExtractionStage('capturing');
    const selection = slideViewerRef.current.getActiveSelection();
    const slideImage = slideViewerRef.current.getSlideImage(selection || undefined);
    
    if (!slideImage) {
      toast.error('Could not capture slide image');
      setExtractionStage('idle');
      return;
    }

    setExtractionStage('analyzing');
    
    try {
      await supabase.auth.refreshSession();
      
      const { data: { user } } = await supabase.auth.getUser();
      let difficultyPref = 'easy';
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('question_difficulty_preference')
          .eq('id', user.id)
          .single();
        difficultyPref = profile?.question_difficulty_preference || 'easy';
      }

      const { data, error } = await supabase.functions.invoke('extract-slide-question', {
        body: { slideImage, questionType, difficulty_preference: difficultyPref },
      });

      if (error) {
        toast.error(error.message || 'Failed to extract question from slide');
        setExtractionStage('idle');
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || 'No question found on this slide');
        setExtractionStage('idle');
        return;
      }

      if (selection) {
        slideViewerRef.current?.clearSelection();
        setHasSelection(false);
      }

      const transformedData: ExtractedQuestionData = {};
      const rawData = data.data;
      
      if (questionType === 'mcq') {
        transformedData.mcq = {
          question: rawData.question || '',
          options: rawData.options || ['', '', '', ''],
          correct_answer: rawData.correctAnswer || 'A',
          explanation: rawData.explanation || '',
        };
      } else if (questionType === 'short_answer') {
        transformedData.short_answer = {
          question: rawData.question || '',
          expected_answer: rawData.expectedAnswer || '',
          explanation: rawData.explanation || '',
        };
      } else if (questionType === 'coding') {
        transformedData.coding = {
          problem: rawData.question || rawData.problem || '',
          function_name: rawData.functionName || '',
          parameters: rawData.parameters || '',
          return_type: rawData.returnType || '',
          examples: rawData.examples?.map((e: { input: string; output: string }) => `Input: ${e.input}, Output: ${e.output}`) || [],
          constraints: rawData.constraints ? [rawData.constraints] : [],
          starter_code: rawData.starterCode || '',
        };
      }

      if (skipPreview) {
        await handleConfirmSendQuestion(transformedData, true);
        setExtractionStage('idle');
        return;
      }

      setPreviewQuestionType(questionType as QuestionType);
      setPreviewExtractedData(transformedData);
      setIsPreviewOpen(true);
      setExtractionStage('idle');
    } catch (err) {
      console.error('Error in handleSendSlideQuestion:', err);
      toast.error('An error occurred while processing the slide');
      setExtractionStage('idle');
      isProcessingSlideQuestionRef.current = false;
    }
  }, [currentSlideNumber, handleConfirmSendQuestion]);

  // Handle confirming voice question
  const handleConfirmVoiceQuestion = useCallback(async (editedQuestion: ExtractedVoiceQuestion) => {
    setIsSendingVoiceQuestion(true);
    try {
      await sendExtractedQuestion({
        question_text: editedQuestion.question_text,
        suggested_type: editedQuestion.suggested_type,
      });
      toast.success('Question sent to students!');
      setIsVoicePreviewOpen(false);
      setVoicePreviewData(null);
    } catch (err) {
      console.error('Error in handleConfirmVoiceQuestion:', err);
      toast.error('Failed to send question');
    } finally {
      setIsSendingVoiceQuestion(false);
    }
  }, [sendExtractedQuestion]);

  useEffect(() => {
    handleSendSlideQuestionRef.current = handleSendSlideQuestion;
  }, [handleSendSlideQuestion]);

  useEffect(() => {
    if (!isPreviewOpen) isProcessingSlideQuestionRef.current = false;
  }, [isPreviewOpen]);

  // Proactive token refresh for extended sessions
  useEffect(() => {
    if (!isRecording) return;
    const refreshTimer = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession();
      if (error) console.warn('⚠️ Proactive auth refresh failed:', error.message);
    }, 5 * 60 * 1000);
    return () => clearInterval(refreshTimer);
  }, [isRecording]);

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

    const { data, error } = await supabase
      .from('lecture_materials')
      .select('*')
      .eq('instructor_id', user.id)
      .or('file_type.eq.application/pdf,file_type.ilike.%presentation%,file_type.ilike.%powerpoint%')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching presentations:', error);
      return;
    }

    const slides: SlideData[] = (data || []).map((m) => ({
      id: m.id,
      title: m.title,
      slides: [],
      totalSlides: 0,
      createdAt: m.created_at,
      fileType: m.file_type || 'application/pdf',
    }));

    setPresentations(slides);
  };

  const handleStartPresentation = async (presentation: SlideData) => {
    setActivePresentation(presentation);
    setIsFullscreen(true);
    setCurrentSlideText('');
    setCurrentSlideNumber(1);
    
    trackSlidePresenterStarted(presentation.id);
    
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

  const handleUploadComplete = async () => {
    setShowUploader(false);
    await fetchPresentations();
    toast.success('Slides uploaded!');
  };

  // Delete a presentation
  const handleDeletePresentation = async (presentationId: string) => {
    if (!confirm('Delete this presentation? This cannot be undone.')) return;

    try {
      const { data: material } = await supabase
        .from('lecture_materials')
        .select('file_path, pdf_fallback_path')
        .eq('id', presentationId)
        .single();

      // Delete preset questions (legacy cleanup)
      await supabase
        .from('slide_preset_questions')
        .delete()
        .eq('material_id', presentationId);

      const { error } = await supabase
        .from('lecture_materials')
        .delete()
        .eq('id', presentationId);

      if (error) throw error;

      if (material?.file_path) {
        await supabase.storage.from('lecture-materials').remove([material.file_path]);
      }
      if (material?.pdf_fallback_path) {
        await supabase.storage.from('lecture-materials').remove([material.pdf_fallback_path]);
      }

      setPresentations(prev => prev.filter(p => p.id !== presentationId));
      toast.success('Presentation deleted');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete presentation');
    }
  };

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) handleExitPresentation();
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) handleExitPresentation();
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

  // Fullscreen presentation mode
  if (isFullscreen && activePresentation) {
    const isPptxPresentation = activePresentation.fileType?.includes('presentation') || 
                               activePresentation.fileType?.includes('powerpoint');

    return (
      <div className="fixed inset-0 bg-black z-50">
        {/* Voice Command Flash Overlay */}
        {!isPptxPresentation && (
          <div 
            className={cn(
              "absolute inset-0 pointer-events-none z-[60] transition-opacity duration-300",
              voiceCommandDetected ? "opacity-100" : "opacity-0"
            )}
          >
            <div className={cn(
              "absolute inset-0 border-8 border-emerald-400 rounded-lg",
              voiceCommandDetected && "animate-[border-flash_0.5s_ease-out]"
            )} 
            style={{
              boxShadow: voiceCommandDetected 
                ? 'inset 0 0 60px rgba(52, 211, 153, 0.3), 0 0 60px rgba(52, 211, 153, 0.5)' 
                : 'none'
            }}
            />
            {voiceCommandDetected && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[voice-icon-appear_0.3s_ease-out]">
                <div className="bg-emerald-500/90 rounded-full p-6 shadow-[0_0_60px_rgba(52,211,153,0.8)]">
                  <Mic className="w-12 h-12 text-white animate-pulse" />
                </div>
              </div>
            )}
          </div>
        )}

        {isPptxPresentation ? (
          <PptxViewer
            ref={slideViewerRef as React.RefObject<PptxViewerRef>}
            presentationId={activePresentation.id}
            title={activePresentation.title}
            onExit={handleExitPresentation}
            onSlideChange={handleSlideChange}
          />
        ) : (
          <SlideViewer
            ref={slideViewerRef}
            presentationId={activePresentation.id}
            title={activePresentation.title}
            onExit={handleExitPresentation}
            onSlideChange={handleSlideChange}
            isSelectionMode={isSelectionMode}
            onSelectionChange={handleSelectionChange}
          />
        )}

        {/* Recording Controls */}
        <SlideRecordingControls
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          studentCount={studentCount}
          autoQuestionEnabled={autoQuestionEnabled}
          nextAutoQuestionIn={nextAutoQuestionIn}
          autoQuestionInterval={autoQuestionInterval}
          isSendingQuestion={isSendingQuestion}
          voiceCommandDetected={voiceCommandDetected}
          extractionStage={extractionStage}
          isSelectionMode={isSelectionMode}
          hasSelection={hasSelection}
          onToggleSelectionMode={handleToggleSelectionMode}
          onClearSelection={handleClearSelection}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onManualSend={handleManualQuestionSend}
          onToggleAutoQuestion={toggleAutoQuestion}
          onTestAutoQuestion={handleTestAutoQuestion}
          onSendSlideQuestion={handleSendSlideQuestion}
        />
        
        <SlidePresenterOverlay
          directState={{
            isRecording,
            recordingDuration,
            studentCount,
            autoQuestionEnabled,
            nextAutoQuestionIn,
          }}
        />
        
        <SlideQuestionPreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          questionType={previewQuestionType}
          extractedData={previewExtractedData}
          onConfirmSend={handleConfirmSendQuestion}
          isSending={isSendingFromPreview}
        />
        
        <VoiceQuestionPreviewDialog
          open={isVoicePreviewOpen}
          onOpenChange={setIsVoicePreviewOpen}
          extractedQuestion={voicePreviewData}
          onConfirmSend={handleConfirmVoiceQuestion}
          isSending={isSendingVoiceQuestion}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
              Upload PDF or PowerPoint slides to start presenting with integrated live lecture tools
            </p>
            <Button onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Your First Slides
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((presentation) => {
              const isPptx = presentation.fileType?.includes('presentation') || 
                             presentation.fileType?.includes('powerpoint');
              return (
                <div
                  key={presentation.id}
                  className="border rounded-lg overflow-hidden bg-card hover:border-primary/50 transition-colors group"
                >
                  <div 
                    className="aspect-video bg-muted flex items-center justify-center relative cursor-pointer"
                    onClick={() => handleStartPresentation(presentation)}
                  >
                    <Presentation className="h-12 w-12 text-muted-foreground" />
                    {isPptx && (
                      <div className="absolute top-2 right-2 bg-amber-500/90 text-white text-xs px-2 py-1 rounded">
                        Animations
                      </div>
                    )}
                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button variant="secondary">Start Presenting</Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold truncate">{presentation.title}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm text-muted-foreground">
                        {isPptx ? 'PowerPoint' : 'PDF'} • {new Date(presentation.createdAt).toLocaleDateString()}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePresentation(presentation.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
