import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, Copy, Check, UserPlus, Share2, Crown, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
  member_count?: number;
  user_role?: string;
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    full_name: string | null;
  } | null;
}

interface StudyGroupsProps {
  userId: string;
}

export function StudyGroups({ userId }: StudyGroupsProps) {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  // Form states
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchGroups();
  }, [userId]);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupMembers(selectedGroup);
    }
  }, [selectedGroup]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      
      // Get groups the user is a member of
      const { data: memberData, error: memberError } = await supabase
        .from("study_group_members")
        .select("group_id, role")
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

      // Add member count and user role to each group
      const groupsWithCounts = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count } = await supabase
            .from("study_group_members")
            .select("*", { count: 'exact', head: true })
            .eq("group_id", group.id);
          
          const userMember = memberData.find(m => m.group_id === group.id);
          
          return {
            ...group,
            member_count: count || 0,
            user_role: userMember?.role || 'member'
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

  const fetchGroupMembers = async (groupId: string) => {
    try {
      const { data, error } = await supabase
        .from("study_group_members")
        .select(`
          id,
          user_id,
          role,
          joined_at
        `)
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });

      if (error) throw error;
      
      // Fetch profile names separately
      if (data && data.length > 0) {
        const userIds = data.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        const membersWithProfiles = data.map(member => ({
          ...member,
          profiles: profiles?.find(p => p.id === member.user_id) || null
        }));
        
        setGroupMembers(membersWithProfiles as GroupMember[]);
      } else {
        setGroupMembers([]);
      }
    } catch (error: any) {
      console.error("Error fetching members:", error);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a group name",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // Get user's org_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      const { error } = await supabase
        .from("study_groups")
        .insert({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          created_by: userId,
          org_id: profileData?.org_id || null,
          invite_code: '', // Will be set by trigger
        });

      if (error) throw error;

      toast({
        title: "Group created!",
        description: "Your study group has been created successfully",
      });

      setGroupName("");
      setGroupDescription("");
      setShowCreateDialog(false);
      fetchGroups();
    } catch (error: any) {
      console.error("Error creating group:", error);
      toast({
        title: "Failed to create group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!inviteCode.trim()) {
      toast({
        title: "Code required",
        description: "Please enter an invite code",
        variant: "destructive",
      });
      return;
    }

    setJoining(true);
    try {
      const { error } = await supabase.rpc('join_group_by_code', {
        _invite_code: inviteCode.trim().toUpperCase()
      });

      if (error) throw error;

      toast({
        title: "Joined group!",
        description: "You've successfully joined the study group",
      });

      setInviteCode("");
      setShowJoinDialog(false);
      fetchGroups();
    } catch (error: any) {
      console.error("Error joining group:", error);
      toast({
        title: "Failed to join group",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({
      title: "Copied!",
      description: "Invite code copied to clipboard",
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Study Groups</h2>
        </div>
        <div className="flex gap-2">
          <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Join Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join Study Group</DialogTitle>
                <DialogDescription>
                  Enter an invite code to join an existing study group
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-code">Invite Code</Label>
                  <Input
                    id="invite-code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="GRP-XXXXXXXX"
                    maxLength={12}
                  />
                </div>
                <Button onClick={handleJoinGroup} disabled={joining} className="w-full">
                  {joining ? "Joining..." : "Join Group"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Study Group</DialogTitle>
                <DialogDescription>
                  Create a new study group to collaborate with classmates
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">Group Name *</Label>
                  <Input
                    id="group-name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., CS101 Study Group"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-description">Description (Optional)</Label>
                  <Textarea
                    id="group-description"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Brief description of your study group..."
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <Button onClick={handleCreateGroup} disabled={creating} className="w-full">
                  {creating ? "Creating..." : "Create Group"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Groups list */}
      {groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            You're not part of any study groups yet
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            Create Your First Group
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground">{group.name}</h3>
                      {getRoleIcon(group.user_role || 'member')}
                    </div>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{group.member_count} members</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {group.user_role}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <code className="flex-1 text-sm font-mono">{group.invite_code}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyInviteCode(group.invite_code)}
                  >
                    {copiedCode === group.invite_code ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
                >
                  {selectedGroup === group.id ? "Hide Members" : "View Members"}
                </Button>

                {selectedGroup === group.id && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-sm font-semibold text-foreground">Members:</p>
                    {groupMembers.map((member) => (
                      <div key={member.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {member.profiles?.full_name || "Unknown User"}
                        </span>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(member.role)}
                          <Badge variant="outline" className="text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
