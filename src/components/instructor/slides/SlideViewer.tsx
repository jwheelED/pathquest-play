import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { toast } from 'sonner';

interface SlideViewerProps {
  presentationId: string;
  title: string;
  onExit: () => void;
  onSlideChange?: (slideText: string, pageNumber: number) => void;
}

export function SlideViewer({ presentationId, title, onExit, onSlideChange }: SlideViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      // @ts-ignore
      if (!window.pdfjsLib) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.async = true;
        document.body.appendChild(script);
        
        await new Promise((resolve) => {
          script.onload = resolve;
        });

        // @ts-ignore
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    };

    loadPdfJs();
  }, []);

  // Fetch PDF URL
  useEffect(() => {
    const fetchPdf = async () => {
      setLoading(true);
      
      try {
        // Get the lecture material
        const { data: material, error } = await supabase
          .from('lecture_materials')
          .select('file_path')
          .eq('id', presentationId)
          .single();

        if (error || !material) throw new Error('Presentation not found');

        // Get signed URL
        const { data: signedData, error: signError } = await supabase.storage
          .from('lecture-materials')
          .createSignedUrl(material.file_path, 3600); // 1 hour

        if (signError || !signedData) throw new Error('Failed to get file URL');

        setPdfUrl(signedData.signedUrl);
      } catch (error: any) {
        console.error('Error loading presentation:', error);
        toast.error('Failed to load presentation');
        onExit();
      }
    };

    fetchPdf();
  }, [presentationId, onExit]);

  // Load and render PDF
  useEffect(() => {
    if (!pdfUrl) return;

    const loadPdf = async () => {
      try {
        // @ts-ignore
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) {
          setTimeout(loadPdf, 500);
          return;
        }

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoading(false);
        
        renderPage(1);
      } catch (error) {
        console.error('Error loading PDF:', error);
        toast.error('Failed to load PDF');
      }
    };

    loadPdf();
  }, [pdfUrl]);

  // Extract text from current page and notify parent
  const extractPageText = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !onSlideChange) return;

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text items and join them
      const textItems = textContent.items
        .map((item: any) => item.str)
        .filter((str: string) => str.trim())
        .join(' ');
      
      console.log(`📄 Slide ${pageNum} text (${textItems.length} chars):`, textItems.substring(0, 200));
      onSlideChange(textItems, pageNum);
    } catch (error) {
      console.error('Error extracting page text:', error);
    }
  }, [onSlideChange]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Calculate scale to fit the container
      const container = containerRef.current;
      if (!container) return;

      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth - 100;
      const containerHeight = container.clientHeight - 100;
      
      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      const fitScale = Math.min(scaleX, scaleY) * scale;

      const scaledViewport = page.getViewport({ scale: fitScale });
      
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;

      // Extract text for the current slide
      extractPageText(pageNum);
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  }, [scale, extractPageText]);

  // Re-render on page change or scale change
  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage(currentPage);
    }
  }, [currentPage, scale, loading, renderPage]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goToNextPage();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'Home':
          e.preventDefault();
          setCurrentPage(1);
          break;
        case 'End':
          e.preventDefault();
          setCurrentPage(totalPages);
          break;
        case '+':
        case '=':
          e.preventDefault();
          setScale((s) => Math.min(s + 0.25, 3));
          break;
        case '-':
          e.preventDefault();
          setScale((s) => Math.max(s - 0.25, 0.5));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  const goToNextPage = () => {
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  };

  const goToPrevPage = () => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  };

  // Handle click navigation (click left = prev, click right = next)
  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const halfWidth = rect.width / 2;

    if (clickX < halfWidth) {
      goToPrevPage();
    } else {
      goToNextPage();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center bg-black relative"
    >
      {/* Top controls */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onExit}
            className="bg-black/50 hover:bg-black/70 text-white border-0"
          >
            <X className="h-4 w-4 mr-2" />
            Exit
          </Button>
          <span className="text-white/80 text-sm bg-black/50 px-3 py-1.5 rounded">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
            className="bg-black/50 hover:bg-black/70 text-white border-0"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-white/80 text-sm bg-black/50 px-2 py-1 rounded min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
            className="bg-black/50 hover:bg-black/70 text-white border-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Slide canvas */}
      {loading ? (
        <div className="text-white">Loading presentation...</div>
      ) : (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-pointer max-w-full max-h-full"
        />
      )}

      {/* Bottom navigation */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
        <Button
          variant="secondary"
          size="icon"
          onClick={goToPrevPage}
          disabled={currentPage === 1}
          className="bg-black/50 hover:bg-black/70 text-white border-0 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="bg-black/50 px-4 py-2 rounded-full">
          <span className="text-white font-medium">
            {currentPage} / {totalPages}
          </span>
        </div>

        <Button
          variant="secondary"
          size="icon"
          onClick={goToNextPage}
          disabled={currentPage === totalPages}
          className="bg-black/50 hover:bg-black/70 text-white border-0 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-4 right-4 text-white/40 text-xs z-10">
        ← → Arrow keys or click to navigate • ESC to exit
      </div>
    </div>
  );
}