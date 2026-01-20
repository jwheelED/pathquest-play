import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Gauge } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DifficultyLevel = "easy" | "medium" | "hard";

export function QuestionDifficultySettings() {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("easy");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialDifficulty, setInitialDifficulty] = useState<DifficultyLevel>("easy");

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    setHasChanges(difficulty !== initialDifficulty);
  }, [difficulty, initialDifficulty]);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("question_difficulty_preference")
        .eq("id", user.id)
        .single();

      if (profile?.question_difficulty_preference) {
        const pref = profile.question_difficulty_preference as DifficultyLevel;
        setDifficulty(pref);
        setInitialDifficulty(pref);
      }
    } catch (error) {
      console.error("Error fetching difficulty settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ question_difficulty_preference: difficulty })
        .eq("id", user.id);

      if (error) throw error;

      setInitialDifficulty(difficulty);
      toast.success("Difficulty preference saved");
    } catch (error) {
      console.error("Error saving difficulty settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Question Difficulty</CardTitle>
        </div>
        <CardDescription>
          Set the default difficulty for auto-generated questions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Default Difficulty Level</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as DifficultyLevel)}>
            <SelectTrigger>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">
                <div className="flex flex-col items-start">
                  <span className="font-medium">Easy</span>
                  <span className="text-xs text-muted-foreground">Basic recall, simple concepts</span>
                </div>
              </SelectItem>
              <SelectItem value="medium">
                <div className="flex flex-col items-start">
                  <span className="font-medium">Medium</span>
                  <span className="text-xs text-muted-foreground">Understanding, application</span>
                </div>
              </SelectItem>
              <SelectItem value="hard">
                <div className="flex flex-col items-start">
                  <span className="font-medium">Hard</span>
                  <span className="text-xs text-muted-foreground">Analysis, synthesis, complex reasoning</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            {difficulty === "easy" && "Questions will focus on basic recall and straightforward concepts from slides/lecture."}
            {difficulty === "medium" && "Questions will require understanding and application of concepts taught."}
            {difficulty === "hard" && "Questions will require analysis, synthesis, and complex reasoning skills."}
          </p>
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
            "Save Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
