import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { X, AlertCircle, ExternalLink, RefreshCw, Loader2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const getConversionProgress = (status: string | null): { percent: number; label: string } => {
  if (!status) return { percent: 0, label: '' };
  if (status === 'pending') return { percent: 5, label: 'Queued...' };
  if (status === 'processing') return { percent: 15, label: 'Starting...' };
  if (status === 'processing:downloading') return { percent: 15, label: 'Downloading file...' };
  if (status === 'processing:uploading_to_converter') return { percent: 30, label: 'Preparing conversion...' };
  if (status === 'processing:converting') return { percent: 50, label: 'Converting slides...' };
  if (status === 'processing:downloading_pdf') return { percent: 75, label: 'Finalizing...' };
  if (status === 'processing:uploading_pdf') return { percent: 90, label: 'Almost done...' };
  if (status === 'completed') return { percent: 100, label: 'Ready' };
  if (status === 'failed') return { percent: 0, label: 'Failed' };
  // Fallback for any processing: prefix we don't know
  if (status.startsWith('processing')) return { percent: 20, label: 'Processing...' };
  return { percent: 0, label: '' };
};

interface PptxViewerProps {
  presentationId: string;
  title: string;
  onExit: () => void;
  onSlideChange?: (slideText: string, pageNumber: number) => void;
}

export interface PptxViewerRef {
  getSlideImage: () => string | null;
  getCurrentSlideNumber: () => number;
  getActiveSelection: () => null;
  clearSelection: () => void;
}

/**
 * PPTX Viewer using Microsoft Office Online embed
 * Preserves animations and formatting from the original PowerPoint file
 * Supports slide extraction via PDF fallback (converted in background)
 */
export const PptxViewer = forwardRef<PptxViewerRef, PptxViewerProps>(
  ({ presentationId, title, onExit, onSlideChange }, ref) => {
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    
    // PDF fallback state for slide extraction
    const [pdfFallbackPath, setPdfFallbackPath] = useState<string | null>(null);
    const [conversionStatus, setConversionStatus] = useState<string | null>(null);
    const [cachedSlideImage, setCachedSlideImage] = useState<string | null>(null);
    const [loadingSlideImage, setLoadingSlideImage] = useState(false);
    const pdfDocRef = useRef<any>(null);

    // Load slide image from PDF fallback on-demand
    const loadSlideImageFromPdf = useCallback(async (): Promise<string | null> => {
      if (!pdfFallbackPath) {
        toast.warning('Slide extraction not ready yet. Please wait for PDF conversion to complete.');
        return null;
      }

      setLoadingSlideImage(true);

      try {
        // Get signed URL for PDF fallback
        const { data: signedData, error: signError } = await supabase.storage
          .from('lecture-materials')
          .createSignedUrl(pdfFallbackPath, 60 * 5); // 5 min expiry

        if (signError || !signedData) {
          console.error('Failed to get PDF fallback URL:', signError);
          toast.error('Failed to access slide for extraction');
          return null;
        }

        // Use global PDF.js (same as SlideViewer pattern)
        // @ts-ignore
        let pdfjsLib = window.pdfjsLib;
        
        // Load PDF.js if not already loaded
        if (!pdfjsLib) {
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
          
          // @ts-ignore
          pdfjsLib = window.pdfjsLib;
        }

        // Load PDF document if not cached
        if (!pdfDocRef.current) {
          const loadingTask = pdfjsLib.getDocument(signedData.signedUrl);
          pdfDocRef.current = await loadingTask.promise;
        }

        const pdfDoc = pdfDocRef.current;
        const pageNum = Math.min(currentPage, pdfDoc.numPages);
        const page = await pdfDoc.getPage(pageNum);

        // Render to canvas at high resolution
        const scale = 2;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert to JPEG with compression
        const imageData = canvas.toDataURL('image/jpeg', 0.75);
        setCachedSlideImage(imageData);
        return imageData;

      } catch (err) {
        console.error('Error loading slide from PDF fallback:', err);
        toast.error('Failed to extract slide image');
        return null;
      } finally {
        setLoadingSlideImage(false);
      }
    }, [pdfFallbackPath, currentPage]);

    // Clear cached slide image when page changes (but keep PDF document cached)
    useEffect(() => {
      setCachedSlideImage(null);
    }, [currentPage]);

    // Pre-load slide image when PDF fallback is available
    useEffect(() => {
      if (pdfFallbackPath && conversionStatus === 'completed' && !cachedSlideImage && !loadingSlideImage) {
        console.log('🔄 Pre-loading slide image from PDF fallback for extraction...');
        loadSlideImageFromPdf();
      }
    }, [pdfFallbackPath, conversionStatus, cachedSlideImage, loadingSlideImage, loadSlideImageFromPdf]);

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      getSlideImage: () => {
        // Return cached slide image from PDF fallback if available
        if (cachedSlideImage) {
          return cachedSlideImage;
        }
        if (!pdfFallbackPath) {
          toast.warning('Slide extraction not ready yet. Please wait for PDF conversion to complete.');
          return null;
        }
        if (loadingSlideImage) {
          toast.info('Loading slide for extraction... Please try again in a moment.');
          return null;
        }
        // Trigger async load - user may need to retry
        loadSlideImageFromPdf();
        toast.info('Loading slide for extraction... Please try again.');
        return null;
      },
      getCurrentSlideNumber: () => currentPage,
      getActiveSelection: () => null,
      clearSelection: () => {},
    }));

    // Generate Office Online embed URL and check for PDF fallback
    const generateEmbedUrl = useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        // Get the lecture material file path and PDF fallback info
        const { data: material, error: materialError } = await supabase
          .from('lecture_materials')
          .select('file_path, file_type, pdf_fallback_path, pdf_conversion_status')
          .eq('id', presentationId)
          .single();

        if (materialError || !material) {
          throw new Error('Presentation not found');
        }

        // Store PDF fallback info
        setPdfFallbackPath(material.pdf_fallback_path);
        setConversionStatus(material.pdf_conversion_status);

        // Verify it's a PPTX file
        const isPptx = material.file_type?.includes('presentation') || 
                       material.file_type?.includes('powerpoint') ||
                       material.file_path.toLowerCase().endsWith('.pptx') ||
                       material.file_path.toLowerCase().endsWith('.ppt');

        if (!isPptx) {
          throw new Error('This viewer only supports PowerPoint files');
        }

        // Create a long-lived signed URL (Office needs to fetch the file)
        // Using 4 hours expiry for extended presentations
        const { data: signedData, error: signError } = await supabase.storage
          .from('lecture-materials')
          .createSignedUrl(material.file_path, 4 * 60 * 60);

        if (signError || !signedData) {
          throw new Error('Failed to generate file access URL');
        }

        // Build the Office Online embed URL
        // The src parameter must be URL-encoded
        const encodedUrl = encodeURIComponent(signedData.signedUrl);
        const officeEmbedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;

        console.log('📊 Office Online embed URL generated for PPTX');
        setEmbedUrl(officeEmbedUrl);
        setLoading(false);

        // Notify parent of slide change (limited info for PPTX)
        onSlideChange?.('PowerPoint presentation with animations', 1);

      } catch (err: any) {
        console.error('Error generating Office embed URL:', err);
        setError(err.message || 'Failed to load presentation');
        setLoading(false);
      }
    }, [presentationId, onSlideChange]);

    // Poll for PDF conversion status if pending/processing
    useEffect(() => {
      if (conversionStatus === 'pending' || conversionStatus?.startsWith('processing')) {
        const pollInterval = setInterval(async () => {
          const { data } = await supabase
            .from('lecture_materials')
            .select('pdf_fallback_path, pdf_conversion_status')
            .eq('id', presentationId)
            .single();
          
          if (data) {
            setPdfFallbackPath(data.pdf_fallback_path);
            setConversionStatus(data.pdf_conversion_status);
            
            if (data.pdf_conversion_status === 'completed') {
              toast.success('PDF conversion complete! Slide extraction is now available.');
              clearInterval(pollInterval);
            } else if (data.pdf_conversion_status === 'failed') {
              toast.error('PDF conversion failed. Slide extraction unavailable.');
              clearInterval(pollInterval);
            }
          }
        }, 3000); // Poll every 3 seconds for responsive progress

        return () => clearInterval(pollInterval);
      }
    }, [conversionStatus, presentationId]);

    useEffect(() => {
      generateEmbedUrl();
    }, [generateEmbedUrl]);

    // Handle keyboard navigation (ESC to exit)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onExit();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onExit]);

    // Refresh the embed URL (regenerate signed URL)
    const handleRefresh = () => {
      generateEmbedUrl();
    };

    // Open in new tab for full Office Online experience
    const handleOpenInNewTab = () => {
      if (embedUrl) {
        window.open(embedUrl.replace('/embed.aspx', '/view.aspx'), '_blank');
      }
    };

    return (
      <div className="w-full h-full flex flex-col bg-black relative">
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
            <span className="text-amber-400/90 text-xs bg-black/50 px-2 py-1 rounded">
              PowerPoint (animations enabled)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              className="bg-black/50 hover:bg-black/70 text-white border-0"
              title="Refresh presentation"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenInNewTab}
              className="bg-black/50 hover:bg-black/70 text-white border-0"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex items-center justify-center pt-16 pb-14 px-4">
          {loading ? (
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
              <p>Loading PowerPoint presentation...</p>
              <p className="text-sm text-white/60 mt-2">
                This may take a moment for large files
              </p>
            </div>
          ) : error ? (
            <div className="text-center max-w-md">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-white mb-2">Failed to load presentation</p>
              <p className="text-white/60 text-sm mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="secondary" onClick={handleRefresh}>
                  Try Again
                </Button>
                <Button variant="outline" onClick={onExit}>
                  Go Back
                </Button>
              </div>
            </div>
          ) : embedUrl ? (
            <div className="w-full h-full flex items-center justify-center">
              <iframe
                src={embedUrl}
                className="rounded-lg"
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  aspectRatio: '16 / 9',
                  objectFit: 'contain',
                }}
                frameBorder="0"
                allowFullScreen
                title={`PowerPoint: ${title}`}
              />
            </div>
          ) : null}
        </div>

        {/* Bottom info bar with extraction status and slide selector */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="bg-black/60 text-white/70 text-xs px-4 py-2 rounded-lg flex items-center gap-3">
            <span>💡 Use PowerPoint's controls to navigate</span>
            <span className="text-white/30">•</span>
            
            {/* Slide number selector for extraction */}
            {conversionStatus === 'completed' && pdfFallbackPath && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-white/60">Extract slide:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-white hover:bg-white/20"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    type="number"
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1) {
                        setCurrentPage(val);
                      }
                    }}
                    className="w-12 h-6 text-center text-xs bg-white/10 border-white/20 text-white px-1"
                    min={1}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-white hover:bg-white/20"
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="text-white/30">•</span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {loadingSlideImage ? 'Loading...' : cachedSlideImage ? 'Ready' : 'Extraction ready'}
                </span>
              </>
            )}
            
            {(conversionStatus === 'pending' || conversionStatus?.startsWith('processing')) && (() => {
              const progress = getConversionProgress(conversionStatus);
              return (
                <div className="flex items-center gap-2 min-w-[200px]">
                  <Progress value={progress.percent} className="h-2 w-24 bg-white/20" />
                  <span className="text-amber-400 text-xs whitespace-nowrap">
                    {progress.percent}% — {progress.label}
                  </span>
                </div>
              );
            })()}
            
            {conversionStatus === 'failed' && (
              <span className="flex items-center gap-1.5 text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Extraction unavailable
              </span>
            )}
            
            {!conversionStatus && (
              <span className="text-white/50">Slide extraction not configured</span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

PptxViewer.displayName = 'PptxViewer';
