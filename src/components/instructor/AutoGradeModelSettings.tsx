import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function AutoGradeModelSettings() {
  const { toast } = useToast();
  const [model, setModel] = useState<'flash' | 'pro'>('flash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModelPreference();
  }, []);

  const fetchModelPreference = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('auto_grade_model')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      if (data?.auto_grade_model) {
        setModel(data.auto_grade_model as 'flash' | 'pro');
      }
    } catch (error) {
      console.error('Error fetching model preference:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = async (value: string) => {
    const newModel = value as 'flash' | 'pro';
    setModel(newModel);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ auto_grade_model: newModel })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Model Updated",
        description: `Auto-grading will now use ${newModel === 'pro' ? 'Premium (Pro)' : 'Standard (Flash)'} model`,
      });
    } catch (error) {
      console.error('Error updating model:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update model preference",
      });
    }
  };

  if (loading) {
    return (
      <Card className="pixel-corners">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Auto-Grade AI Model
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="pixel-corners">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Auto-Grade AI Model
        </CardTitle>
        <CardDescription>
          Choose the AI model for auto-grading short answer questions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={model} onValueChange={handleModelChange} className="space-y-4">
          <div className="flex items-start space-x-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors">
            <RadioGroupItem value="flash" id="flash" />
            <div className="flex-1">
              <Label htmlFor="flash" className="cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-semibold">Standard (Flash)</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Recommended</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Fast and cost-effective. Good balance of speed and accuracy for most grading tasks.
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">Best for:</span> Regular classroom quizzes, quick feedback
                </div>
              </Label>
            </div>
          </div>

          <div className="flex items-start space-x-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors">
            <RadioGroupItem value="pro" id="pro" />
            <div className="flex-1">
              <Label htmlFor="pro" className="cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-warning" />
                  <span className="font-semibold">Premium (Pro)</span>
                  <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded">More Accurate</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  More powerful reasoning and nuanced understanding. Better at handling complex answers and edge cases.
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">Best for:</span> High-stakes assessments, complex conceptual questions
                </div>
              </Label>
            </div>
          </div>
        </RadioGroup>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p className="font-medium mb-1">💡 Tip:</p>
          <p>
            Both models use the enhanced grading rubric. The Premium model provides more nuanced 
            evaluation and better handles ambiguous or partially correct answers.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
