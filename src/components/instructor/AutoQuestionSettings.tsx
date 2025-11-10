import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Info, Zap, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const AutoQuestionSettings = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [interval, setInterval] = useState<number>(15);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
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
        .select('auto_question_enabled, auto_question_interval')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setIsEnabled(data.auto_question_enabled || false);
        setInterval(data.auto_question_interval || 15);
      }
    } catch (error) {
      console.error('Error fetching auto-question settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          auto_question_enabled: isEnabled,
          auto_question_interval: interval
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "✅ Settings saved",
        description: isEnabled 
          ? `Auto-questions will be sent every ${interval} minutes during recording`
          : "Auto-questions disabled",
      });

      setHasChanges(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error saving settings",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    setHasChanges(true);
  };

  const handleIntervalChange = (value: string) => {
    setInterval(parseInt(value));
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              Automatic Question Generation
            </CardTitle>
            <CardDescription>
              Send questions automatically at fixed time intervals during live lectures
            </CardDescription>
          </div>
          {isEnabled && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-question-toggle" className="text-base">
              Enable Auto-Questions
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically generate and send questions during recording
            </p>
          </div>
          <Switch
            id="auto-question-toggle"
            checked={isEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {/* Interval Selection */}
        {isEnabled && (
          <>
            <div className="space-y-3">
              <Label htmlFor="interval-select">Question Interval</Label>
              <Select value={interval.toString()} onValueChange={handleIntervalChange}>
                <SelectTrigger id="interval-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Every 5 minutes (experimental - may skip if quality is low)</SelectItem>
                  <SelectItem value="10">Every 10 minutes</SelectItem>
                  <SelectItem value="15">Every 15 minutes (recommended)</SelectItem>
                  <SelectItem value="20">Every 20 minutes</SelectItem>
                  <SelectItem value="30">Every 30 minutes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Questions will be generated from the content covered in each interval
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm text-blue-900 dark:text-blue-200">
                  <p className="font-medium">How it works:</p>
                  <ul className="space-y-1 list-disc list-inside ml-2">
                    <li>Questions are generated from your lecture content at regular intervals</li>
                    <li>Voice commands ("send question now") take priority and reset the timer</li>
                    <li>A countdown will show you when the next auto-question is coming</li>
                    <li>Same 60-second cooldown applies to all questions</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};
