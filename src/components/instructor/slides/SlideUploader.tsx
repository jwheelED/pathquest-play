import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, FileImage, X, Loader2, FileType } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getOrgId } from '@/hooks/useOrgId';
import { useQueryClient } from '@tanstack/react-query';

interface SlideUploaderProps {
  onComplete: () => void;
  onCancel: () => void;
}

type UploadStage = 'idle' | 'uploading' | 'converting' | 'saving';

export function SlideUploader({ onComplete, onCancel }: SlideUploaderProps) {
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const queryClient = useQueryClient();

  const MAX_PPTX_SIZE = 100 * 1024 * 1024; // 100MB for CloudConvert
  const MAX_PDF_SIZE = 200 * 1024 * 1024; // 200MB for direct upload

  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt (older format)
  ];

  const isPptxFile = (file: File) => {
    return file.type.includes('presentation') || file.type.includes('powerpoint') || 
           file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt');
  };

  // State to track whether user wants to skip conversion (preserve animations)
  const [skipConversion, setSkipConversion] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const isAllowed = allowedTypes.includes(file.type) || 
                      file.name.toLowerCase().endsWith('.pdf') ||
                      file.name.toLowerCase().endsWith('.pptx') ||
                      file.name.toLowerCase().endsWith('.ppt');
    
    if (!isAllowed) {
      toast.error('Please upload a PDF or PowerPoint file (.pdf, .pptx, .ppt)');
      return;
    }

    // Check file size based on type
    if (isPptxFile(file)) {
      if (file.size > MAX_PPTX_SIZE) {
        toast.error('PowerPoint files must be under 100MB for conversion.');
        return;
      }
    } else if (file.size > MAX_PDF_SIZE) {
      toast.error('File size must be less than 200MB');
      return;
    }

    setSelectedFile(file);
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get pure base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      toast.error('Please provide a title and select a file');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setUploadStage('uploading');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let filePath: string;
      let finalFileType = selectedFile.type;
      let finalFileName = selectedFile.name;

      // Check if this is a PPTX file
      if (isPptxFile(selectedFile)) {
        // If skipConversion is true, upload PPTX directly (preserves animations via Office Online)
        if (skipConversion) {
          setUploadProgress(30);
          
          const fileExt = selectedFile.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          filePath = `${user.id}/slides/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('lecture-materials')
            .upload(filePath, selectedFile, { upsert: true });

          if (uploadError) throw uploadError;

          // Keep original PPTX file type
          finalFileType = selectedFile.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          finalFileName = selectedFile.name;
          
          setUploadProgress(70);
          toast.info('PowerPoint uploaded with animations preserved!');
        } else {
          // Convert PPTX to PDF (default behavior)
          setUploadStage('converting');
          setUploadProgress(30);
          
          toast.info('Converting PowerPoint to PDF...', { duration: 5000 });
          
          // Convert file to base64
          const fileBase64 = await fileToBase64(selectedFile);
          
          setUploadProgress(50);
          
          // Call edge function to convert PPTX to PDF
          const { data, error } = await supabase.functions.invoke('convert-pptx-to-pdf', {
            body: {
              fileBase64,
              fileName: selectedFile.name,
              instructorId: user.id,
            },
          });

          if (error) {
            console.error('Conversion error:', error);
            throw new Error(error.message || 'Failed to convert PowerPoint file');
          }

          if (!data?.success) {
            throw new Error(data?.error || 'Conversion failed');
          }

          filePath = data.filePath;
          finalFileType = 'application/pdf';
          finalFileName = data.convertedName;
          
          setUploadProgress(80);
        }
      } else {
        // Direct PDF upload
        setUploadProgress(30);
        
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        filePath = `${user.id}/slides/${fileName}`;

        // Use upsert option in case there's a leftover file from a failed deletion
        const { error: uploadError } = await supabase.storage
          .from('lecture-materials')
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        setUploadProgress(70);
      }

      // Save to database
      setUploadStage('saving');
      setUploadProgress(90);
      
      const orgId = await getOrgId(user.id);
      const { error: dbError } = await supabase
        .from('lecture_materials')
        .insert({
          instructor_id: user.id,
          org_id: orgId,
          file_name: finalFileName,
          file_path: filePath,
          file_type: finalFileType,
          file_size: selectedFile.size,
          title: title.trim(),
          description: 'Presentation slides',
        });

      if (dbError) throw dbError;

      setUploadProgress(100);
      const successMessage = isPptxFile(selectedFile) 
        ? (skipConversion ? 'PowerPoint uploaded with animations!' : 'PowerPoint converted and uploaded!') 
        : 'Slides uploaded successfully!';
      toast.success(successMessage);
      
      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
      queryClient.invalidateQueries({ queryKey: ["slides"] });
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
      
      onComplete();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload slides');
    } finally {
      setUploading(false);
      setUploadStage('idle');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    
    const isAllowed = allowedTypes.includes(file?.type) || 
                      file?.name.toLowerCase().endsWith('.pdf') ||
                      file?.name.toLowerCase().endsWith('.pptx') ||
                      file?.name.toLowerCase().endsWith('.ppt');
    
    if (file && isAllowed) {
      // Check file size based on type
      if (isPptxFile(file)) {
        if (file.size > MAX_PPTX_SIZE) {
          toast.error('PowerPoint files must be under 100MB for conversion.');
          return;
        }
      } else if (file.size > MAX_PDF_SIZE) {
        toast.error('File size must be less than 200MB');
        return;
      }
      setSelectedFile(file);
    } else {
      toast.error('Please drop a PDF or PowerPoint file');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const getStageMessage = () => {
    switch (uploadStage) {
      case 'uploading':
        return 'Uploading...';
      case 'converting':
        return 'Converting PowerPoint to PDF...';
      case 'saving':
        return 'Saving...';
      default:
        return `${uploadProgress}%`;
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return null;
    if (isPptxFile(selectedFile)) {
      return <FileType className="h-12 w-12 text-orange-500 mx-auto" />;
    }
    return <FileImage className="h-12 w-12 text-primary mx-auto" />;
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Upload Presentation Slides</CardTitle>
            <CardDescription>
              Upload a PDF or PowerPoint file to present during your live lectures
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="title">Presentation Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Week 5 - Machine Learning Basics"
            className="mt-1.5"
            disabled={uploading}
          />
        </div>

        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {selectedFile ? (
            <div className="space-y-3">
              {getFileIcon()}
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              
              {/* PPTX animation preservation option */}
              {isPptxFile(selectedFile) && (
                <div className="bg-muted/50 rounded-lg p-3 text-left space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipConversion}
                      onChange={(e) => setSkipConversion(e.target.checked)}
                      className="mt-1 rounded border-border"
                      disabled={uploading}
                    />
                    <div className="flex-1">
                      <span className="font-medium text-sm">Preserve animations & formatting</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uses Microsoft Office Online viewer. Best for presentations with animations, transitions, or complex formatting.
                      </p>
                    </div>
                  </label>
                  {!skipConversion && (
                    <p className="text-xs text-amber-600 pl-6">
                      Will convert to PDF (animations will be lost, but slide extraction works)
                    </p>
                  )}
                  {skipConversion && (
                    <p className="text-xs text-muted-foreground pl-6">
                      ⚠️ Note: Slide question extraction is not available with Office Online viewer
                    </p>
                  )}
                </div>
              )}
              
              {!uploading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    setSkipConversion(false);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Drag and drop your PDF or PowerPoint here</p>
                <p className="text-sm text-muted-foreground">PDF up to 200MB • PowerPoint up to 100MB</p>
              </div>
              <Input
                type="file"
                accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
                disabled={uploading}
              />
            </div>
          )}
        </div>

        {uploading && (
          <div className="space-y-2">
            <Progress value={uploadProgress} />
            <p className="text-sm text-center text-muted-foreground">
              {getStageMessage()}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={uploading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !title.trim() || uploading}
            className="flex-1"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadStage === 'converting' ? 'Converting...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Slides
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
