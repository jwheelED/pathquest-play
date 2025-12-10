import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
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
import { cn } from '@/lib/utils';

interface SlideViewerProps {
  presentationId: string;
  title: string;
  onExit: () => void;
  onSlideChange?: (slideText: string, pageNumber: number) => void;
  isSelectionMode?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlideViewerRef {
  getSlideImage: (selection?: SelectionRect) => string | null;
  getCurrentSlideNumber: () => number;
  getActiveSelection: () => SelectionRect | null;
  clearSelection: () => void;
}

export const SlideViewer = forwardRef<SlideViewerRef, SlideViewerProps>(
  ({ presentationId, title, onExit, onSlideChange, isSelectionMode = false, onSelectionChange }, ref) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Selection state
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionRect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Clear selection when slide changes
  useEffect(() => {
    setActiveSelection(null);
    setSelectionStart(null);
    setSelectionEnd(null);
    onSelectionChange?.(false);
  }, [currentPage, onSelectionChange]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSlideImage: (selection?: SelectionRect) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      
      const sel = selection || activeSelection;
      if (sel && sel.width > 10 && sel.height > 10) {
        // Create a temp canvas with just the selected region
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sel.width;
        tempCanvas.height = sel.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(
          canvas,
          sel.x, sel.y, sel.width, sel.height,
          0, 0, sel.width, sel.height
        );
        return tempCanvas.toDataURL('image/png');
      }
      
      return canvas.toDataURL('image/png');
    },
    getCurrentSlideNumber: () => currentPage,
    getActiveSelection: () => activeSelection,
    clearSelection: () => {
      setActiveSelection(null);
      setSelectionStart(null);
      setSelectionEnd(null);
      onSelectionChange?.(false);
    },
  }));

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
      // Don't handle navigation in selection mode
      if (isSelectionMode) {
        if (e.key === 'Escape') {
          setActiveSelection(null);
          setSelectionStart(null);
          setSelectionEnd(null);
          onSelectionChange?.(false);
        }
        return;
      }

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
  }, [totalPages, isSelectionMode, onSelectionChange]);

  const goToNextPage = () => {
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  };

  const goToPrevPage = () => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  };

  // Handle click navigation (click left = prev, click right = next)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isSelectionMode) return; // Don't navigate in selection mode

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const halfWidth = rect.width / 2;

    if (clickX < halfWidth) {
      goToPrevPage();
    } else {
      goToNextPage();
    }
  };

  // Selection handlers
  const getRelativeCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleSelectionStart = (e: React.MouseEvent) => {
    if (!isSelectionMode) return;
    e.preventDefault();
    const coords = getRelativeCoords(e);
    setSelectionStart(coords);
    setSelectionEnd(coords);
    setIsDrawing(true);
    setActiveSelection(null);
  };

  const handleSelectionMove = (e: React.MouseEvent) => {
    if (!isSelectionMode || !isDrawing || !selectionStart) return;
    e.preventDefault();
    const coords = getRelativeCoords(e);
    setSelectionEnd(coords);
  };

  const handleSelectionEnd = (e: React.MouseEvent) => {
    if (!isSelectionMode || !isDrawing || !selectionStart || !selectionEnd) {
      setIsDrawing(false);
      return;
    }
    e.preventDefault();
    setIsDrawing(false);

    // Calculate normalized rectangle (handle negative widths/heights)
    const x = Math.min(selectionStart.x, selectionEnd.x);
    const y = Math.min(selectionStart.y, selectionEnd.y);
    const width = Math.abs(selectionEnd.x - selectionStart.x);
    const height = Math.abs(selectionEnd.y - selectionStart.y);

    // Minimum size validation (50x50)
    if (width >= 50 && height >= 50) {
      setActiveSelection({ x, y, width, height });
      onSelectionChange?.(true);
    } else {
      setActiveSelection(null);
      setSelectionStart(null);
      setSelectionEnd(null);
      onSelectionChange?.(false);
      if (width > 0 || height > 0) {
        toast.info('Selection too small - drag a larger area');
      }
    }
  };

  // Calculate current drawing rectangle
  const drawingRect = selectionStart && selectionEnd && isDrawing ? {
    x: Math.min(selectionStart.x, selectionEnd.x),
    y: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y),
  } : null;

  const displayRect = activeSelection || drawingRect;
  const canvas = canvasRef.current;
  const canvasWidth = canvas?.width || 0;
  const canvasHeight = canvas?.height || 0;

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center bg-black relative"
    >
      {/* Selection mode banner */}
      {isSelectionMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-amber-500/90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-sm font-medium">Selection Mode: Draw a rectangle on the slide</span>
        </div>
      )}

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

      {/* Slide canvas with selection overlay */}
      {loading ? (
        <div className="text-white">Loading presentation...</div>
      ) : (
        <div className="relative">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleSelectionStart}
            onMouseMove={handleSelectionMove}
            onMouseUp={handleSelectionEnd}
            onMouseLeave={handleSelectionEnd}
            className={cn(
              "max-w-full max-h-full",
              isSelectionMode ? "cursor-crosshair" : "cursor-pointer"
            )}
          />

          {/* Selection overlay */}
          {isSelectionMode && displayRect && canvasWidth > 0 && (
            <>
              {/* Dim overlay for unselected areas */}
              {/* Top */}
              <div 
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: displayRect.y,
                }}
              />
              {/* Bottom */}
              <div 
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  top: displayRect.y + displayRect.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
              {/* Left */}
              <div 
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  top: displayRect.y,
                  left: 0,
                  width: displayRect.x,
                  height: displayRect.height,
                }}
              />
              {/* Right */}
              <div 
                className="absolute bg-black/60 pointer-events-none"
                style={{
                  top: displayRect.y,
                  left: displayRect.x + displayRect.width,
                  right: 0,
                  height: displayRect.height,
                }}
              />

              {/* Selection rectangle border */}
              <div
                className="absolute border-2 border-amber-400 pointer-events-none"
                style={{
                  left: displayRect.x,
                  top: displayRect.y,
                  width: displayRect.width,
                  height: displayRect.height,
                }}
              >
                {/* Corner handles */}
                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 rounded-sm" />
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-sm" />
                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 rounded-sm" />
                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-sm" />
                
                {/* Label */}
                <div className="absolute -top-7 left-0 bg-amber-500 text-white px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                  Selected Region
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
        <Button
          variant="secondary"
          size="icon"
          onClick={goToPrevPage}
          disabled={currentPage === 1 || isSelectionMode}
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
          disabled={currentPage === totalPages || isSelectionMode}
          className="bg-black/50 hover:bg-black/70 text-white border-0 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-4 right-4 text-white/40 text-xs z-10">
        {isSelectionMode 
          ? 'Draw to select • ESC to clear' 
          : '← → Arrow keys or click to navigate • ESC to exit'}
      </div>
    </div>
  );
});

SlideViewer.displayName = 'SlideViewer';
