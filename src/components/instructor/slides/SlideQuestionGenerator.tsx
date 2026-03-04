import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SlideQuestionGeneratorProps {
  materialId: string;
  filePath: string;
  fileType: string;
  courseId?: string | null;
  onComplete: () => void;
  onSkip: () => void;
}

export function SlideQuestionGenerator({
  materialId,
  filePath,
  fileType,
  courseId,
  onComplete,
  onSkip,
}: SlideQuestionGeneratorProps) {
  const [stage, setStage] = useState<'loading-pdf' | 'rendering' | 'analyzing' | 'done' | 'error'>('loading-pdf');
  const [progress, setProgress] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [questionsGenerated, setQuestionsGenerated] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef(false);

  const isPptx = fileType?.includes('presentation') || fileType?.includes('powerpoint');

  // Load PDF.js
  useEffect(() => {
    // @ts-ignore
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      document.body.appendChild(script);
      script.onload = () => {
        // @ts-ignore
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      };
    }
  }, []);

  const renderSlideToImage = useCallback(async (pdf: any, pageNum: number): Promise<string | null> => {
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); // Good quality for AI

      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.error(`Error rendering slide ${pageNum}:`, e);
      return null;
    }
  }, []);

  const startGeneration = useCallback(async () => {
    abortRef.current = false; // Reset abort flag for fresh run
    try {
      // Get PDF URL (either direct or from pdf_fallback_path for PPTX)
      let pdfPath = filePath;

      if (isPptx) {
        // Need to get the PDF fallback path
        const { data: material } = await supabase
          .from('lecture_materials')
          .select('pdf_fallback_path, pdf_conversion_status')
          .eq('id', materialId)
          .single();

        if (!material?.pdf_fallback_path || material.pdf_conversion_status !== 'completed') {
          setStage('error');
          setErrorMessage('PDF conversion not yet complete for this PPTX. Please wait for conversion to finish.');
          return;
        }
        pdfPath = material.pdf_fallback_path;
      }

      // Get signed URL
      const { data: signedData, error: signError } = await supabase.storage
        .from('lecture-materials')
        .createSignedUrl(pdfPath, 3600);

      if (signError || !signedData) {
        throw new Error('Failed to get file URL');
      }

      // Wait for PDF.js
      let attempts = 0;
      // @ts-ignore
      while (!window.pdfjsLib && attempts < 20) {
        await new Promise(r => setTimeout(r, 250));
        attempts++;
      }
      // @ts-ignore
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF.js failed to load');

      setStage('rendering');
      const pdf = await pdfjsLib.getDocument(signedData.signedUrl).promise;
      const numPages = pdf.numPages;
      setTotalSlides(numPages);

      // Determine which slides to send for question generation
      // Strategy: send all slides and let AI decide which ones to skip
      // But batch them in groups of 3-4 to avoid payload size issues
      const BATCH_SIZE = 3;
      const batches: Array<Array<{ number: number; image: string }>> = [];
      let currentBatch: Array<{ number: number; image: string }> = [];

      for (let i = 1; i <= numPages; i++) {
        if (abortRef.current) return;
        setCurrentSlide(i);
        setProgress(Math.round((i / numPages) * 40)); // 0-40% for rendering

        const image = await renderSlideToImage(pdf, i);
        if (image) {
          currentBatch.push({ number: i, image });
          if (currentBatch.length >= BATCH_SIZE) {
            batches.push(currentBatch);
            currentBatch = [];
          }
        }
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      // Send batches to edge function
      setStage('analyzing');
      let totalGenerated = 0;

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (abortRef.current) return;
        const batch = batches[bIdx];
        const batchProgress = 40 + Math.round(((bIdx + 1) / batches.length) * 55); // 40-95%
        setProgress(batchProgress);
        setCurrentSlide(batch[batch.length - 1].number);

        try {
          const { data, error } = await supabase.functions.invoke('generate-slide-questions', {
            body: {
              material_id: materialId,
              slides: batch,
              course_id: courseId,
            },
          });

          if (error) {
            console.error('Batch error:', error);
            toast.error(`Error analyzing slides ${batch[0].number}-${batch[batch.length - 1].number}`);
            continue;
          }

          if (data?.questions_generated) {
            totalGenerated += data.questions_generated;
            setQuestionsGenerated(totalGenerated);
          }
        } catch (batchError) {
          console.error('Batch processing error:', batchError);
        }
      }

      setProgress(100);
      setStage('done');
      setQuestionsGenerated(totalGenerated);

      if (totalGenerated === 0) {
        toast.info('No questions could be generated from these slides');
      } else {
        toast.success(`Generated ${totalGenerated} questions from ${numPages} slides!`);
      }
    } catch (err) {
      console.error('Generation error:', err);
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [materialId, filePath, fileType, courseId, isPptx, renderSlideToImage]);

  // Auto-start generation
  useEffect(() => {
    const timer = setTimeout(() => startGeneration(), 500);
    return () => {
      clearTimeout(timer);
      abortRef.current = true;
    };
  }, [startGeneration]);

  const getStageLabel = () => {
    switch (stage) {
      case 'loading-pdf': return 'Loading presentation...';
      case 'rendering': return `Rendering slide ${currentSlide} of ${totalSlides}...`;
      case 'analyzing': return `Analyzing slide ${currentSlide} of ${totalSlides}...`;
      case 'done': return 'Complete!';
      case 'error': return 'Error';
    }
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Generating Slide Questions
        </CardTitle>
        <CardDescription>
          Edvana is analyzing your slides and creating questions for each one
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hidden canvas for rendering */}
        <canvas ref={canvasRef} className="hidden" />

        {stage === 'error' ? (
          <div className="text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{errorMessage}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={onSkip}>Skip</Button>
              <Button onClick={() => { setStage('loading-pdf'); startGeneration(); }}>Retry</Button>
            </div>
          </div>
        ) : stage === 'done' ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <p className="font-semibold text-lg">{questionsGenerated} questions generated</p>
              <p className="text-sm text-muted-foreground">
                from {totalSlides} slides
              </p>
            </div>
            <Button onClick={onComplete} className="w-full">
              Review & Edit Questions
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <Progress value={progress} />
            <p className="text-sm text-center text-muted-foreground">
              {getStageLabel()}
            </p>
            {questionsGenerated > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                {questionsGenerated} question{questionsGenerated !== 1 ? 's' : ''} generated so far
              </p>
            )}
            <Button variant="outline" size="sm" onClick={onSkip} className="w-full">
              Skip — I'll add questions manually
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
