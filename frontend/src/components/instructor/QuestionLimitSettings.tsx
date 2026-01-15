import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save } from "lucide-react";

export const QuestionLimitSettings = () => {
  const [dailyLimit, setDailyLimit] = useState<number>(200);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCurrentLimit();
  }, []);

  const fetchCurrentLimit = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('daily_question_limit')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data?.daily_question_limit) {
        setDailyLimit(data.daily_question_limit);
      }
    } catch (error) {
      console.error('Error fetching limit:', error);
      toast({
        title: "Error",
        description: "Failed to load your current limit",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (dailyLimit < 1 || dailyLimit > 500) {
      toast({
        title: "Invalid limit",
        description: "Daily limit must be between 1 and 500 questions",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({ daily_question_limit: dailyLimit })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "✅ Saved!",
        description: `Daily question limit updated to ${dailyLimit}`,
      });
    } catch (error) {
      console.error('Error saving limit:', error);
      toast({
        title: "Error",
        description: "Failed to save your settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Question Limit</CardTitle>
        <CardDescription>
          Set the maximum number of lecture check-in questions you can send per day. 
          This helps manage your classroom engagement while preventing accidental over-use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dailyLimit">Questions per day (1-500)</Label>
          <Input
            id="dailyLimit"
            type="number"
            min={1}
            max={500}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseInt(e.target.value) || 1)}
            className="max-w-xs"
          />
          <p className="text-sm text-muted-foreground">
            Current setting: <strong>{dailyLimit} questions/day</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            💡 Recommended: 200 for multiple classes, 100 for single class, 500 for testing
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
