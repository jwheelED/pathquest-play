import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { X, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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
 */
export const PptxViewer = forwardRef<PptxViewerRef, PptxViewerProps>(
  ({ presentationId, title, onExit, onSlideChange }, ref) => {
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Expose ref methods (limited functionality for Office embed)
    useImperativeHandle(ref, () => ({
      getSlideImage: () => {
        // Cannot capture slide image from Office embed iframe (cross-origin restriction)
        toast.warning('Slide image capture not available for PowerPoint presentations');
        return null;
      },
      getCurrentSlideNumber: () => currentPage,
      getActiveSelection: () => null,
      clearSelection: () => {},
    }));

    // Generate Office Online embed URL
    const generateEmbedUrl = useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        // Get the lecture material file path
        const { data: material, error: materialError } = await supabase
          .from('lecture_materials')
          .select('file_path, file_type')
          .eq('id', presentationId)
          .single();

        if (materialError || !material) {
          throw new Error('Presentation not found');
        }

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
        <div className="flex-1 flex items-center justify-center pt-16 pb-4 px-4">
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
            <iframe
              src={embedUrl}
              className="w-full h-full rounded-lg"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              frameBorder="0"
              allowFullScreen
              title={`PowerPoint: ${title}`}
            />
          ) : null}
        </div>

        {/* Bottom info bar */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="bg-black/60 text-white/70 text-xs px-4 py-2 rounded-lg">
            <span>💡 Use PowerPoint's built-in controls to navigate slides with animations</span>
            <span className="mx-2">•</span>
            <span>Note: Slide question extraction not available for embedded PowerPoint</span>
          </div>
        </div>
      </div>
    );
  }
);

PptxViewer.displayName = 'PptxViewer';
