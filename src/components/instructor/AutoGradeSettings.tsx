import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const AutoGradeSettings = () => {
  const [autoGradeShortAnswer, setAutoGradeShortAnswer] = useState(false);
  const [autoGradeCoding, setAutoGradeCoding] = useState(false);
  const [autoGradeMCQ, setAutoGradeMCQ] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialValues, setInitialValues] = useState({
    short_answer: false,
    coding: false,
    mcq: true
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('auto_grade_short_answer, auto_grade_coding, auto_grade_mcq')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        const values = {
          short_answer: data.auto_grade_short_answer || false,
          coding: data.auto_grade_coding || false,
          mcq: data.auto_grade_mcq !== false // Default to true
        };
        setAutoGradeShortAnswer(values.short_answer);
        setAutoGradeCoding(values.coding);
        setAutoGradeMCQ(values.mcq);
        setInitialValues(values);
      }
    } catch (error) {
      console.error('Error fetching auto-grade settings:', error);
      toast({
        title: "Error loading settings",
        description: "Could not load auto-grading preferences.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const changed = 
      autoGradeShortAnswer !== initialValues.short_answer ||
      autoGradeCoding !== initialValues.coding ||
      autoGradeMCQ !== initialValues.mcq;
    setHasChanges(changed);
  }, [autoGradeShortAnswer, autoGradeCoding, autoGradeMCQ, initialValues]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('profiles')
        .update({
          auto_grade_short_answer: autoGradeShortAnswer,
          auto_grade_coding: autoGradeCoding,
          auto_grade_mcq: autoGradeMCQ
        })
        .eq('id', user.id);

      if (error) throw error;

      setInitialValues({
        short_answer: autoGradeShortAnswer,
        coding: autoGradeCoding,
        mcq: autoGradeMCQ
      });

      toast({
        title: "Settings saved",
        description: "Auto-grading preferences updated successfully."
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save auto-grading preferences.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-Grading Settings</CardTitle>
          <CardDescription>Loading preferences...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Grading Settings</CardTitle>
        <CardDescription>Configure automatic grading for different question types</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div className="space-y-1 flex-1 pr-4">
              <Label htmlFor="auto-grade-short-answer" className="text-base font-medium">
                Short Answer Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                AI compares responses and assigns grades (0-100) with feedback
              </p>
            </div>
            <Switch
              id="auto-grade-short-answer"
              checked={autoGradeShortAnswer}
              onCheckedChange={setAutoGradeShortAnswer}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="space-y-1 flex-1 pr-4">
              <Label htmlFor="auto-grade-coding" className="text-base font-medium">
                Coding Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                All test cases must pass for full credit (100%), otherwise requires review
              </p>
            </div>
            <Switch
              id="auto-grade-coding"
              checked={autoGradeCoding}
              onCheckedChange={setAutoGradeCoding}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="space-y-1 flex-1 pr-4">
              <Label htmlFor="auto-grade-mcq" className="text-base font-medium">
                Multiple Choice Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Instant grading based on correct answer selection
              </p>
            </div>
            <Switch
              id="auto-grade-mcq"
              checked={autoGradeMCQ}
              onCheckedChange={setAutoGradeMCQ}
            />
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
