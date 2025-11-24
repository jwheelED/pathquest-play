import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Share2, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StudyGroup {
  id: string;
  name: string;
  member_count?: number;
}

interface ShareQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  materialId?: string;
  materialTitle?: string;
}

export function ShareQuestionsDialog({
  open,
  onOpenChange,
  userId,
  materialId,
  materialTitle,
}: ShareQuestionsDialogProps) {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchGroups();
      if (materialId) {
        fetchQuestionCount();
      }
    }
  }, [open, userId, materialId]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      
      // Get groups the user is a member of
      const { data: memberData, error: memberError } = await supabase
        .from("study_group_members")
        .select("group_id")
        .eq("user_id", userId);

      if (memberError) throw memberError;

      if (!memberData || memberData.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = memberData.map(m => m.group_id);
      
      // Get group details
      const { data: groupsData, error: groupsError } = await supabase
        .from("study_groups")
        .select("*")
        .in("id", groupIds);

      if (groupsError) throw groupsError;

      // Add member count to each group
      const groupsWithCounts = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count } = await supabase
            .from("study_group_members")
            .select("*", { count: 'exact', head: true })
            .eq("group_id", group.id);
          
          return {
            ...group,
            member_count: count || 0,
          };
        })
      );

      setGroups(groupsWithCounts);
    } catch (error: any) {
      console.error("Error fetching groups:", error);
      toast({
        title: "Error loading groups",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestionCount = async () => {
    if (!materialId) return;

    try {
      const { count, error } = await supabase
        .from("personalized_questions")
        .select("*", { count: 'exact', head: true })
        .eq("source_material_id", materialId)
        .eq("user_id", userId);

      if (error) throw error;
      setQuestionCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching question count:", error);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const handleShare = async () => {
    if (selectedGroups.size === 0) {
      toast({
        title: "No groups selected",
        description: "Please select at least one group to share with",
        variant: "destructive",
      });
      return;
    }

    if (!materialId) {
      toast({
        title: "No material selected",
        description: "Please select a material to share questions from",
        variant: "destructive",
      });
      return;
    }

    setSharing(true);
    try {
      // Get all questions from this material
      const { data: questions, error: questionsError } = await supabase
        .from("personalized_questions")
        .select("id")
        .eq("source_material_id", materialId)
        .eq("user_id", userId);

      if (questionsError) throw questionsError;

      if (!questions || questions.length === 0) {
        toast({
          title: "No questions to share",
          description: "This material doesn't have any questions yet",
          variant: "destructive",
        });
        return;
      }

      // Get user's org_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      // Share each question to each selected group
      let successful = 0;
      let failed = 0;
      
      for (const groupId of selectedGroups) {
        for (const question of questions) {
          try {
            const { error } = await supabase
              .from("study_group_questions")
              .insert({
                group_id: groupId,
                question_id: question.id,
                shared_by: userId,
                org_id: profileData?.org_id || null,
              });
            
            if (error) {
              // Likely duplicate, which is fine
              console.log("Share error (possibly duplicate):", error);
              failed++;
            } else {
              successful++;
            }
          } catch (error) {
            failed++;
          }
        }
      }

      if (successful > 0) {
        toast({
          title: "Questions shared!",
          description: `Shared ${questions.length} questions to ${selectedGroups.size} group(s)`,
        });
      }

      if (failed > 0) {
        toast({
          title: "Some shares failed",
          description: `${failed} question shares failed (may be already shared)`,
          variant: "destructive",
        });
      }

      setSelectedGroups(new Set());
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sharing questions:", error);
      toast({
        title: "Failed to share questions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Questions with Groups</DialogTitle>
          <DialogDescription>
            {materialTitle ? `Share questions from "${materialTitle}"` : "Select groups to share your questions with"}
          </DialogDescription>
        </DialogHeader>

        {questionCount > 0 && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              <strong>{questionCount}</strong> questions will be shared
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              You're not part of any study groups yet
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Create or join a group to share questions
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleGroup(group.id)}
                >
                  <Checkbox
                    checked={selectedGroups.has(group.id)}
                    onCheckedChange={() => toggleGroup(group.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{group.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Users className="w-3 h-3" />
                      <span>{group.member_count} members</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={handleShare}
              disabled={sharing || selectedGroups.size === 0}
              className="w-full"
            >
              {sharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share with {selectedGroups.size} group{selectedGroups.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
