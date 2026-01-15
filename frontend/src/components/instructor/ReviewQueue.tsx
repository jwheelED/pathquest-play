import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Edit, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Draft {
  id: string;
  topic: string;
  assignment_type: string;
  slide_text: string;
  code_example: string | null;
  demo_snippets: any;
  status: string;
}

export const ReviewQueue = ({ refreshTrigger }: { refreshTrigger: number }) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchDrafts();
  }, [refreshTrigger]);

  const fetchDrafts = async () => {
    const { data, error } = await supabase
      .from('content_drafts')
      .select('*')
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching drafts:', error);
      return;
    }
    setDrafts(data || []);
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from('content_drafts')
      .update({ status: 'approved' })
      .eq('id', id);

    if (error) {
      toast({ title: "Failed to approve", variant: "destructive" });
      return;
    }

    toast({ title: "Content approved!" });
    fetchDrafts();
  };

  const handleEdit = (draft: Draft) => {
    setEditingId(draft.id);
    setEditContent(JSON.stringify(draft.demo_snippets, null, 2));
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const parsedContent = JSON.parse(editContent);
      const { error } = await supabase
        .from('content_drafts')
        .update({ demo_snippets: parsedContent })
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Changes saved!" });
      setEditingId(null);
      fetchDrafts();
    } catch (error) {
      toast({ title: "Invalid JSON format", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('content_drafts')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }

    toast({ title: "Draft deleted" });
    fetchDrafts();
  };

  if (drafts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Queue</CardTitle>
          <CardDescription>No drafts pending review</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Queue</CardTitle>
        <CardDescription>{drafts.length} draft(s) pending approval</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{draft.topic}</h3>
                <Badge variant="secondary" className="mt-1">
                  {draft.assignment_type.replace('_', ' ')}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleEdit(draft)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(draft.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={() => handleApprove(draft.id)}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </div>
            </div>
            
            {editingId === draft.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveEdit(draft.id)}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {draft.assignment_type === 'quiz' && draft.demo_snippets?.questions && (
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Questions: {draft.demo_snippets.questions.length}</p>
                    {draft.demo_snippets.questions.slice(0, 2).map((q: any, i: number) => (
                      <div key={i} className="pl-3 border-l-2 border-primary/20">
                        <p className="text-muted-foreground">{i + 1}. {q.question}</p>
                      </div>
                    ))}
                  </div>
                )}
                {draft.assignment_type === 'lesson' && draft.demo_snippets?.content && (
                  <p className="text-sm text-muted-foreground line-clamp-4">{draft.demo_snippets.content}</p>
                )}
                {draft.assignment_type === 'mini_project' && draft.demo_snippets?.prompt && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{draft.demo_snippets.prompt}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};