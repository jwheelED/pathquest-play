import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function QuestionPreviewSettings() {
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("question_preview_enabled")
      .eq("id", user.id)
      .single();

    if (data) {
      setPreviewEnabled(data.question_preview_enabled ?? true);
    }
    setLoading(false);
  };

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    setPreviewEnabled(enabled);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ question_preview_enabled: enabled })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to save setting");
      setPreviewEnabled(!enabled); // Revert
    } else {
      toast.success(enabled ? "Question preview enabled" : "Questions will send immediately");
    }
    setSaving(false);
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
        <CardTitle className="flex items-center gap-2">
          {previewEnabled ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          Question Preview
        </CardTitle>
        <CardDescription>
          Control whether to preview questions before sending to students
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="preview-toggle" className="text-sm font-medium">
              Preview before sending
            </Label>
            <p className="text-xs text-muted-foreground">
              {previewEnabled 
                ? "You'll see a preview dialog to edit questions before sending" 
                : "Questions from voice commands and 'Send Question' button will send immediately"}
            </p>
          </div>
          <Switch
            id="preview-toggle"
            checked={previewEnabled}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
        </div>

        <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          <p className="font-medium mb-1">Affects:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Voice command "send question"</li>
            <li>"Send Question Now" button during recording</li>
          </ul>
          <p className="mt-2 text-[10px]">
            Note: Auto-generated questions (from timer) always send automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
