import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, X, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface QuickUploadSheetProps {
  userId: string;
  trigger: React.ReactNode;
  onUploadComplete?: () => void;
}

export function QuickUploadSheet({ userId, trigger, onUploadComplete }: QuickUploadSheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 52428800) {
        toast.error('File too large. Maximum is 50MB.');
        return;
      }
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (!content.trim() && !file) {
      toast.error('Please add content or upload a file');
      return;
    }

    setUploading(true);

    try {
      let filePath = null;
      let materialType = 'note';

      // Upload file if present
      if (file) {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('student-materials')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        filePath = fileName;
        materialType = fileExt === 'pdf' ? 'pdf' : 'note';
      }

      // Get user's org_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      // Insert material
      const { data: materialData, error: insertError } = await supabase
        .from('student_study_materials')
        .insert({
          user_id: userId,
          org_id: profileData?.org_id || null,
          title: title.trim(),
          material_type: materialType,
          content: content.trim() || null,
          file_path: filePath,
          subject_tags: tags.length > 0 ? tags : null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('Material uploaded!');
      setUploading(false);
      setGenerating(true);

      // Auto-generate questions
      if (materialData) {
        try {
          const { error: generateError } = await supabase.functions.invoke('generate-personalized-questions', {
            body: {
              materialId: materialData.id,
              userId: userId,
              difficulty: 'intermediate',
              questionCount: 5
            }
          });

          if (!generateError) {
            toast.success('5 practice questions generated!', {
              description: 'They\'re now in your learning path'
            });
          }
        } catch (error) {
          console.error('Error generating questions:', error);
        }
      }

      // Reset and close
      setTitle('');
      setContent('');
      setFile(null);
      setTags([]);
      setOpen(false);
      onUploadComplete?.();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setGenerating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Quick Upload
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto max-h-[calc(85vh-120px)] pb-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="quick-title">Title *</Label>
            <Input
              id="quick-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Exam 1 Notes, Chapter 5..."
              maxLength={100}
            />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Upload File (Optional)</Label>
            <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
              <input
                id="quick-file"
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="quick-file" className="cursor-pointer">
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button 
                      onClick={(e) => { e.preventDefault(); setFile(null); }}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload PDF or text file
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="quick-content">
              {file ? 'Additional Notes (Optional)' : 'Content *'}
            </Label>
            <Textarea
              id="quick-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your notes, syllabus content, or key concepts here..."
              rows={6}
              className="resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (Optional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="e.g., Exam 1, Midterm..."
                className="flex-1"
              />
              <Button type="button" onClick={addTag} variant="outline" size="sm">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => setTags(tags.filter(t => t !== tag))} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-sm text-muted-foreground">
                After upload, we'll automatically generate 5 practice questions from your material
              </p>
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleUpload}
            disabled={uploading || generating}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating questions...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload & Generate Questions
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
