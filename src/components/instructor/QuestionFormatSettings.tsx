import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

export const QuestionFormatSettings = ({ instructorId }: { instructorId: string }) => {
  const [format, setFormat] = useState<'multiple_choice' | 'short_answer' | 'coding'>('multiple_choice');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreference();
  }, [instructorId]);

  const fetchPreference = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('question_format_preference')
        .eq('id', instructorId)
        .single();

      if (error) throw error;
      
      if (data?.question_format_preference) {
        setFormat(data.question_format_preference as 'multiple_choice' | 'short_answer' | 'coding');
      }
    } catch (error) {
      console.error('Error fetching preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormatChange = async (value: string) => {
    const newFormat = value as 'multiple_choice' | 'short_answer' | 'coding';
    setFormat(newFormat);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ question_format_preference: newFormat })
        .eq('id', instructorId);

      if (error) throw error;

      toast({
        title: "✅ Preference saved",
        description: `Question format updated to ${newFormat === 'multiple_choice' ? 'Multiple Choice' : newFormat === 'short_answer' ? 'Short Answer' : 'Coding'}`,
      });
    } catch (error: any) {
      console.error('Error updating preference:', error);
      toast({
        title: "Failed to save preference",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Question Format Settings
        </CardTitle>
        <CardDescription>
          Choose the default format for lecture check-in questions sent to students
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={format} onValueChange={handleFormatChange} className="space-y-4">
          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
            <RadioGroupItem value="multiple_choice" id="multiple_choice" />
            <div className="space-y-1 leading-none flex-1">
              <Label htmlFor="multiple_choice" className="font-semibold cursor-pointer">
                Multiple Choice Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                AI generates MCQ with 4 options based on your lecture content. Auto-graded instantly.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
            <RadioGroupItem value="short_answer" id="short_answer" />
            <div className="space-y-1 leading-none flex-1">
              <Label htmlFor="short_answer" className="font-semibold cursor-pointer">
                Short Answer Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Students type their response. Requires manual grading by you.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
            <RadioGroupItem value="coding" id="coding" />
            <div className="space-y-1 leading-none flex-1">
              <Label htmlFor="coding" className="font-semibold cursor-pointer">
                Coding Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Students write code in an IDE-style editor. Requires manual grading by you.
              </p>
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
};