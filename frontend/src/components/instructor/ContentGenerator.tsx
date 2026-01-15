import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "@/hooks/useOrgId";

interface ContentGeneratorProps {
  onGenerated: () => void;
}

export const ContentGenerator = ({ onGenerated }: ContentGeneratorProps) => {
  const [topic, setTopic] = useState("");
  const [assignmentType, setAssignmentType] = useState<"quiz" | "lesson" | "mini_project">("lesson");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Please enter a topic", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-content', {
        body: { topic, assignmentType, studentProgress: "intermediate" }
      });

      if (functionError) throw functionError;

      const content = functionData.content;
      const orgId = await getOrgId(user.id);
      
      const { error: insertError } = await supabase
        .from('content_drafts')
        .insert([{
          instructor_id: user.id,
          org_id: orgId,
          topic,
          assignment_type: assignmentType,
          slide_text: content.title || topic,
          code_example: content.codeExample || content.explanation || null,
          demo_snippets: content,
          status: 'draft'
        }]);

      if (insertError) throw insertError;

      toast({ title: "Content generated successfully!", description: "Check your review queue" });
      setTopic("");
      onGenerated();
    } catch (error: any) {
      console.error('Generation error:', error);
      toast({ 
        title: "Failed to generate content", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Content Generator
        </CardTitle>
        <CardDescription>Generate AI-powered educational content</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input
            id="topic"
            placeholder="e.g., Python Functions, React Hooks..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Content Type</Label>
          <Select value={assignmentType} onValueChange={(v: any) => setAssignmentType(v)}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lesson">Lesson</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="mini_project">Mini Project</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Content
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};