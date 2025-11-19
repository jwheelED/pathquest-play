import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Sparkles, Zap, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ModelOption {
  value: string;
  label: string;
  description: string;
  speed: "fast" | "balanced" | "slow";
  cost: "low" | "medium" | "high";
  quality: "good" | "excellent" | "superior";
}

const AI_MODELS: ModelOption[] = [
  {
    value: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Best balance of speed, cost, and accuracy. Recommended for most use cases.",
    speed: "fast",
    cost: "low",
    quality: "excellent"
  },
  {
    value: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Highest accuracy for complex grading. Better for nuanced partial credit.",
    speed: "balanced",
    cost: "medium",
    quality: "superior"
  },
  {
    value: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    description: "Fastest and cheapest. Good for simple grading tasks.",
    speed: "fast",
    cost: "low",
    quality: "good"
  },
  {
    value: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Strong reasoning with moderate cost. Good alternative to Gemini Pro.",
    speed: "balanced",
    cost: "medium",
    quality: "excellent"
  },
  {
    value: "openai/gpt-5",
    label: "GPT-5",
    description: "Most powerful model. Best accuracy but highest cost and slowest.",
    speed: "slow",
    cost: "high",
    quality: "superior"
  }
];

export const AIModelSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [autoGradeMCQ, setAutoGradeMCQ] = useState(true);
  const [autoGradeShortAnswer, setAutoGradeShortAnswer] = useState(true);
  const [autoGradeCoding, setAutoGradeCoding] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('auto_grade_model, auto_grade_mcq, auto_grade_short_answer, auto_grade_coding')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setSelectedModel(data.auto_grade_model || "google/gemini-2.5-flash");
        setAutoGradeMCQ(data.auto_grade_mcq ?? true);
        setAutoGradeShortAnswer(data.auto_grade_short_answer ?? true);
        setAutoGradeCoding(data.auto_grade_coding ?? false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          auto_grade_model: selectedModel,
          auto_grade_mcq: autoGradeMCQ,
          auto_grade_short_answer: autoGradeShortAnswer,
          auto_grade_coding: autoGradeCoding
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('AI settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getSpeedBadge = (speed: string) => {
    const colors = {
      fast: "bg-green-500/10 text-green-700 dark:text-green-400",
      balanced: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      slow: "bg-orange-500/10 text-orange-700 dark:text-orange-400"
    };
    return <Badge variant="secondary" className={colors[speed as keyof typeof colors]}>{speed}</Badge>;
  };

  const getCostBadge = (cost: string) => {
    const colors = {
      low: "bg-green-500/10 text-green-700 dark:text-green-400",
      medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      high: "bg-red-500/10 text-red-700 dark:text-red-400"
    };
    return <Badge variant="secondary" className={colors[cost as keyof typeof colors]}>${cost}</Badge>;
  };

  const getQualityBadge = (quality: string) => {
    const colors = {
      good: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      excellent: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      superior: "bg-primary/10 text-primary"
    };
    return <Badge variant="secondary" className={colors[quality as keyof typeof colors]}>{quality}</Badge>;
  };

  const currentModel = AI_MODELS.find(m => m.value === selectedModel);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            AI Model Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-2">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Brain className="h-6 w-6 text-primary" />
          AI Model Configuration
        </CardTitle>
        <CardDescription>
          Configure which AI model to use for auto-grading and enable/disable auto-grading features
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Model Selection */}
        <div className="space-y-3">
          <Label htmlFor="model-select" className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Model
          </Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger id="model-select" className="h-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((model) => (
                <SelectItem key={model.value} value={model.value} className="py-3">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium">{model.label}</div>
                    <div className="text-xs text-muted-foreground">{model.description}</div>
                    <div className="flex gap-2 mt-1">
                      {getSpeedBadge(model.speed)}
                      {getCostBadge(model.cost)}
                      {getQualityBadge(model.quality)}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Current Model Info */}
          {currentModel && (
            <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">{currentModel.label}</div>
                  <div className="text-sm text-muted-foreground">{currentModel.description}</div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground">Speed:</span>
                    {getSpeedBadge(currentModel.speed)}
                    <span className="text-xs text-muted-foreground">Cost:</span>
                    {getCostBadge(currentModel.cost)}
                    <span className="text-xs text-muted-foreground">Quality:</span>
                    {getQualityBadge(currentModel.quality)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Auto-Grade Settings */}
        <div className="space-y-4 pt-4 border-t">
          <Label className="text-base font-semibold">Auto-Grading Features</Label>
          
          <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
            <div className="space-y-0.5">
              <Label htmlFor="auto-grade-mcq" className="font-medium cursor-pointer">
                Multiple Choice Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically grade multiple choice questions instantly
              </p>
            </div>
            <Switch
              id="auto-grade-mcq"
              checked={autoGradeMCQ}
              onCheckedChange={setAutoGradeMCQ}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
            <div className="space-y-0.5">
              <Label htmlFor="auto-grade-short" className="font-medium cursor-pointer">
                Short Answer Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Use AI to grade short answer responses with partial credit
              </p>
            </div>
            <Switch
              id="auto-grade-short"
              checked={autoGradeShortAnswer}
              onCheckedChange={setAutoGradeShortAnswer}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
            <div className="space-y-0.5">
              <Label htmlFor="auto-grade-coding" className="font-medium cursor-pointer">
                Coding Questions
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically evaluate and grade coding submissions
              </p>
            </div>
            <Switch
              id="auto-grade-coding"
              checked={autoGradeCoding}
              onCheckedChange={setAutoGradeCoding}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            size="lg"
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
