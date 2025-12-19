import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, X, Loader2, Sparkles, CalendarIcon, ArrowRight, ArrowLeft, Target } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface QuickUploadSheetProps {
  userId: string;
  trigger: React.ReactNode;
  onUploadComplete?: () => void;
}

type Step = 'upload' | 'dates';

export function QuickUploadSheet({ userId, trigger, onUploadComplete }: QuickUploadSheetProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  
  // Upload step state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Date step state
  const [examDate, setExamDate] = useState<Date | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [goalType, setGoalType] = useState<'mastery' | 'balanced' | 'quick'>('balanced');
  
  // Loading states
  const [uploading, setUploading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const daysUntilExam = examDate ? differenceInDays(examDate, startDate) : 0;

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

  const handleContinueToDate = () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!content.trim() && !file) {
      toast.error('Please add content or upload a file');
      return;
    }
    // Set default exam date to 2 weeks from now
    if (!examDate) {
      setExamDate(addDays(new Date(), 14));
    }
    setStep('dates');
  };

  const handleGeneratePlan = async () => {
    if (!examDate) {
      toast.error('Please select your exam date');
      return;
    }

    if (daysUntilExam < 1) {
      toast.error('Exam date must be at least 1 day away');
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
      setGeneratingPlan(true);

      // Generate study plan
      if (materialData) {
        try {
          const { data: planData, error: planError } = await supabase.functions.invoke('generate-study-plan', {
            body: {
              userId,
              materialId: materialData.id,
              materialTitle: title.trim(),
              materialContent: content.trim() || '',
              examDate: format(examDate, 'yyyy-MM-dd'),
              startDate: format(startDate, 'yyyy-MM-dd'),
              goalType,
              daysAvailable: daysUntilExam,
            }
          });

          if (planError) {
            console.error('Plan generation error:', planError);
            toast.error('Could not generate study plan, but your material was saved');
          } else {
            toast.success(`Study plan created! ${daysUntilExam} days until your exam`, {
              description: "Check your dashboard for today's tasks"
            });
          }
        } catch (error) {
          console.error('Error generating study plan:', error);
          toast.error('Material saved, but plan generation failed');
        }
      }

      // Reset and close
      resetForm();
      setOpen(false);
      onUploadComplete?.();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setGeneratingPlan(false);
    }
  };

  const resetForm = () => {
    setStep('upload');
    setTitle('');
    setContent('');
    setFile(null);
    setTags([]);
    setTagInput('');
    setExamDate(undefined);
    setStartDate(new Date());
    setGoalType('balanced');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            {step === 'upload' ? (
              <>
                <Upload className="w-5 h-5 text-primary" />
                Upload Study Material
              </>
            ) : (
              <>
                <CalendarIcon className="w-5 h-5 text-primary" />
                Set Your Study Plan
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto max-h-[calc(85vh-120px)] pb-4">
          {step === 'upload' ? (
            <>
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="quick-title">Title *</Label>
                <Input
                  id="quick-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Organic Chemistry Final, Chapter 5..."
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

              {/* Continue Button */}
              <Button onClick={handleContinueToDate} className="w-full" size="lg">
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          ) : (
            <>
              {/* Exam Date */}
              <div className="space-y-2">
                <Label>When is your exam? *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !examDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {examDate ? format(examDate, 'PPP') : 'Select exam date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={examDate}
                      onSelect={setExamDate}
                      disabled={(date) => date < addDays(new Date(), 1)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label>When do you want to start?</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(date)}
                      disabled={(date) => date < new Date() || (examDate && date >= examDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Days Available Display */}
              {examDate && daysUntilExam > 0 && (
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-primary">{daysUntilExam}</span>
                    <p className="text-sm text-muted-foreground mt-1">days to prepare</p>
                  </div>
                </div>
              )}

              {/* Goal Type */}
              <div className="space-y-3">
                <Label>What's your goal?</Label>
                <div className="grid gap-2">
                  {[
                    { value: 'mastery', label: 'Deep Mastery', desc: 'Thorough understanding, more review cycles' },
                    { value: 'balanced', label: 'Balanced', desc: 'Good coverage with efficient pacing' },
                    { value: 'quick', label: 'Quick Review', desc: 'Focus on key concepts only' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setGoalType(option.value as typeof goalType)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                        goalType === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <Target className={cn(
                        "w-5 h-5 mt-0.5",
                        goalType === option.value ? "text-primary" : "text-muted-foreground"
                      )} />
                      <div>
                        <p className="font-medium">{option.label}</p>
                        <p className="text-sm text-muted-foreground">{option.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    AI will create a personalized study plan with daily tasks from now until your exam
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('upload')}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleGeneratePlan}
                  disabled={uploading || generatingPlan || !examDate || daysUntilExam < 1}
                  className="flex-1"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : generatingPlan ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating plan...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Create Study Plan
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
