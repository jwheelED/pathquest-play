import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, FileImage, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getOrgId } from '@/hooks/useOrgId';

interface SlideUploaderProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function SlideUploader({ onComplete, onCancel }: SlideUploaderProps) {
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only accept PDFs for now (can be extended to images)
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF file');
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      toast.error('File size must be less than 200MB');
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      toast.error('Please provide a title and select a file');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      setUploadProgress(30);

      // Upload the PDF to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/slides/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('lecture-materials')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setUploadProgress(70);

      // Save to database
      const orgId = await getOrgId(user.id);
      const { error: dbError } = await supabase
        .from('lecture_materials')
        .insert({
          instructor_id: user.id,
          org_id: orgId,
          file_name: selectedFile.name,
          file_path: filePath,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
          title: title.trim(),
          description: 'Presentation slides',
        });

      if (dbError) throw dbError;

      setUploadProgress(100);
      onComplete();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload slides');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else {
      toast.error('Please drop a PDF file');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Upload Presentation Slides</CardTitle>
            <CardDescription>
              Upload a PDF file to present during your live lectures
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
            <div className="space-y-2">
              <FileImage className="h-12 w-12 text-primary mx-auto" />
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {!uploading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                >
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Drag and drop your PDF here</p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
              </div>
              <Input
                type="file"
                accept=".pdf"
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
              Uploading... {uploadProgress}%
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
                Uploading...
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
