import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Flag, AlertCircle, HelpCircle, MessageSquare, MoreHorizontal, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const REPORT_TYPES = [
  { value: 'wrong_answer', label: 'Wrong Answer', description: 'The correct answer is incorrect', icon: AlertCircle },
  { value: 'unclear', label: 'Unclear Question', description: 'The question is confusing or ambiguous', icon: HelpCircle },
  { value: 'off_topic', label: 'Off Topic', description: 'Not related to the lecture content', icon: MessageSquare },
  { value: 'other', label: 'Other Issue', description: 'Something else is wrong', icon: MoreHorizontal },
];

interface QuestionReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pausePointId: string;
  questionText: string;
}

export const QuestionReportDialog = ({
  open,
  onOpenChange,
  pausePointId,
  questionText
}: QuestionReportDialogProps) => {
  const [reportType, setReportType] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reportType) {
      toast.error('Please select a report type');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('question_reports')
        .insert({
          student_id: user.id,
          pause_point_id: pausePointId,
          report_type: reportType,
          description: description.trim() || null
        });

      if (error) throw error;

      toast.success('Report submitted. Thank you for your feedback!');
      onOpenChange(false);
      setReportType('');
      setDescription('');
    } catch (error: any) {
      console.error('Failed to submit report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-amber-500" />
            Report Question Issue
          </DialogTitle>
          <DialogDescription>
            Help us improve by reporting issues with this question.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question Preview */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium text-muted-foreground mb-1">Question:</p>
            <p className="line-clamp-3">{questionText}</p>
          </div>

          {/* Report Type Selection */}
          <div className="space-y-3">
            <Label>What's wrong with this question?</Label>
            <RadioGroup value={reportType} onValueChange={setReportType}>
              {REPORT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      reportType === type.value 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setReportType(type.value)}
                  >
                    <RadioGroupItem value={type.value} id={type.value} className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor={type.value} className="flex items-center gap-2 cursor-pointer">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {type.label}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {type.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Optional Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Additional details (optional)</Label>
            <Textarea
              id="description"
              placeholder="Provide more context about the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reportType || submitting}>
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Report'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
