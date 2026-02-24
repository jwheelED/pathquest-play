import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Invite {
  id: string;
  org_id: string;
  email: string;
  status: string;
  created_at: string;
  org_name?: string;
}

export function PendingOrgInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data, error } = await supabase
        .from("instructor_invites")
        .select("id, org_id, email, status, created_at")
        .eq("status", "pending");

      if (error) throw error;
      if (!data || data.length === 0) {
        setInvites([]);
        setLoading(false);
        return;
      }

      // Fetch org names
      const orgIds = [...new Set(data.map(i => i.org_id))];
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);

      const orgMap = new Map(orgs?.map(o => [o.id, o.name]) || []);

      setInvites(data.map(i => ({
        ...i,
        org_name: orgMap.get(i.org_id) || "Unknown Organization",
      })));
    } catch (error) {
      console.error("Error fetching invites:", error);
    } finally {
      setLoading(false);
    }
  };

  const acceptInvite = async (invite: Invite) => {
    setAccepting(invite.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update invite status
      const { error: inviteError } = await supabase
        .from("instructor_invites")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      if (inviteError) throw inviteError;

      // Update instructor's org_id
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ org_id: invite.org_id })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Find an admin from this org and create connection
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("org_id", invite.org_id)
        .limit(10);

      if (adminProfile) {
        for (const profile of adminProfile) {
          const { data: isAdmin } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .eq("role", "admin")
            .maybeSingle();

          if (isAdmin) {
            await supabase
              .from("admin_instructors")
              .insert({ admin_id: profile.id, instructor_id: user.id, org_id: invite.org_id })
              .select();
            break;
          }
        }
      }

      setInvites(prev => prev.filter(i => i.id !== invite.id));
      toast.success(`Joined ${invite.org_name}!`);
    } catch (error: any) {
      console.error("Error accepting invite:", error);
      toast.error(error.message || "Failed to accept invite");
    } finally {
      setAccepting(null);
    }
  };

  const declineInvite = async (inviteId: string) => {
    try {
      // We can't update status since the policy only allows admin writes,
      // but the instructor can simply dismiss it from their UI
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      toast.info("Invite dismissed");
    } catch (error) {
      console.error("Error declining invite:", error);
    }
  };

  if (loading || invites.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="w-5 h-5 text-primary" />
          Organization Invites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between p-3 rounded-lg bg-card border border-border"
          >
            <div>
              <p className="font-medium text-foreground">{invite.org_name}</p>
              <p className="text-xs text-muted-foreground">
                Invited {new Date(invite.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => declineInvite(invite.id)}
                disabled={accepting === invite.id}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => acceptInvite(invite)}
                disabled={accepting === invite.id}
              >
                <Check className="w-4 h-4 mr-1" />
                {accepting === invite.id ? "Joining..." : "Accept"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
