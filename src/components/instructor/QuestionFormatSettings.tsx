import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Settings, Code, FileText } from "lucide-react";

interface QuestionFormatSettingsProps {
  instructorId: string;
  professorType?: 'stem' | 'humanities' | 'medical' | null;
}

export const QuestionFormatSettings = ({ instructorId, professorType }: QuestionFormatSettingsProps) => {
  const [format, setFormat] = useState<'multiple_choice' | 'short_answer' | 'coding'>('multiple_choice');
  const [codingStyle, setCodingStyle] = useState<'simple' | 'full'>('simple');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreference();
  }, [instructorId]);

  const fetchPreference = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('question_format_preference, coding_question_style')
        .eq('id', instructorId)
        .single();

      if (error) throw error;
      
      if (data?.question_format_preference) {
        setFormat(data.question_format_preference as 'multiple_choice' | 'short_answer' | 'coding');
      }
      if (data?.coding_question_style) {
        setCodingStyle(data.coding_question_style as 'simple' | 'full');
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

      // Verify the update worked
      const { data: verifyData } = await supabase
        .from('profiles')
        .select('question_format_preference, coding_question_style')
        .eq('id', instructorId)
        .single();
      console.log('✅ Settings verified after save:', verifyData);

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

  const handleCodingStyleChange = async (value: string) => {
    const newStyle = value as 'simple' | 'full';
    setCodingStyle(newStyle);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ coding_question_style: newStyle })
        .eq('id', instructorId);

      if (error) throw error;

      toast({
        title: "✅ Coding style saved",
        description: newStyle === 'simple' 
          ? "Simple check-ins: 100% for core understanding" 
          : "Full problems: Component-based grading (0-100)",
      });
    } catch (error: any) {
      console.error('Error updating coding style:', error);
      toast({
        title: "Failed to save coding style",
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

          {professorType !== 'humanities' && (
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="coding" id="coding" />
              <div className="space-y-1 leading-none flex-1">
                <Label htmlFor="coding" className="font-semibold cursor-pointer">
                  Coding Questions
                </Label>
                <p className="text-sm text-muted-foreground">
                  Students write code in an editor. Auto-graded for conceptual understanding.
                </p>
              </div>
            </div>
          )}
        </RadioGroup>

        {/* Coding style sub-options - only show when coding is selected */}
        {format === 'coding' && professorType !== 'humanities' && (
          <div className="mt-4 ml-6 p-4 border-l-2 border-primary/20 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              Coding Question Style
            </Label>
            <RadioGroup value={codingStyle} onValueChange={handleCodingStyleChange} className="space-y-3">
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent/50 transition-colors bg-primary/5">
                <RadioGroupItem value="simple" id="coding_simple" />
                <div className="space-y-1 leading-none flex-1">
                  <Label htmlFor="coding_simple" className="font-medium cursor-pointer text-sm">
                    Simple Check-Ins (Recommended)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quick conceptual prompts (e.g., "Write a for loop that..."). <strong>100% if student shows core understanding.</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="full" id="coding_full" />
                <div className="space-y-1 leading-none flex-1">
                  <Label htmlFor="coding_full" className="font-medium cursor-pointer text-sm">
                    Full Coding Problems
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    LeetCode-style with constraints and test cases. Component-based grading (0-100).
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}
      </CardContent>
    </Card>
  );
};