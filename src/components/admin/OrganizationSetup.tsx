import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, Mail, Plus, Trash2, UserPlus, Check, Clock, X, Pencil } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface OrganizationDomain {
  id: string;
  domain: string;
  verified: boolean;
  created_at: string;
}

interface InstructorInvite {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface OrganizationSetupProps {
  onOrgCreated?: () => void;
}

export default function OrganizationSetup({ onOrgCreated }: OrganizationSetupProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [domains, setDomains] = useState<OrganizationDomain[]>([]);
  const [invites, setInvites] = useState<InstructorInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name, slug, created_at")
          .eq("id", profile.org_id)
          .single();

        setOrganization(org);

        if (org) {
          // Fetch domains
          const { data: domainsData } = await supabase
            .from("organization_domains")
            .select("*")
            .eq("org_id", org.id)
            .order("created_at", { ascending: false });

          setDomains(domainsData || []);

          // Fetch pending invites
          const { data: invitesData } = await supabase
            .from("instructor_invites")
            .select("*")
            .eq("org_id", org.id)
            .order("created_at", { ascending: false });

          setInvites(invitesData || []);
        }
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
    } finally {
      setLoading(false);
    }
  };

  const createOrganization = async () => {
    if (!orgName.trim()) {
      toast.error("Please enter an organization name");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate codes (still needed for backward compatibility)
      const { data: adminCode } = await supabase.rpc("generate_admin_code");
      const { data: inviteCode } = await supabase.rpc("generate_org_invite_code");

      // Auto-generate a URL-safe slug from the name; append a short suffix to keep it unique.
      const baseSlug = orgName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

      const { data: newOrg, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: orgName.trim(),
          slug,
          admin_code: adminCode,
          instructor_invite_code: inviteCode,
        })
        .select("id, name, slug, created_at")
        .single();

      if (orgError) throw orgError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ org_id: newOrg.id })
        .eq("id", user.id);

      if (profileError) throw profileError;

      setOrganization(newOrg);
      toast.success("Organization created successfully!");
      onOrgCreated?.();
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  const startEditName = () => {
    if (!organization) return;
    setEditedName(organization.name);
    setEditingName(true);
  };

  const saveName = async () => {
    if (!organization) return;
    const trimmed = editedName.trim();
    if (!trimmed) {
      toast.error("Organization name can't be empty");
      return;
    }
    if (trimmed === organization.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", organization.id);
      if (error) throw error;
      setOrganization({ ...organization, name: trimmed });
      setEditingName(false);
      toast.success("Organization renamed");
    } catch (error: any) {
      console.error("Error renaming organization:", error);
      toast.error(error.message || "Failed to rename organization");
    } finally {
      setSavingName(false);
    }
  };

  const addDomain = async () => {
    if (!newDomain.trim() || !organization) {
      toast.error("Please enter a domain");
      return;
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(newDomain.trim())) {
      toast.error("Please enter a valid domain (e.g., stanford.edu)");
      return;
    }

    setAddingDomain(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("organization_domains")
        .insert({
          org_id: organization.id,
          domain: newDomain.trim().toLowerCase(),
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error("This domain is already added");
        } else {
          throw error;
        }
        return;
      }

      setDomains([data, ...domains]);
      setNewDomain("");
      toast.success("Domain added! Instructors with this email domain will auto-join.");
    } catch (error: any) {
      console.error("Error adding domain:", error);
      toast.error(error.message || "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  };

  const removeDomain = async (domainId: string) => {
    try {
      const { error } = await supabase
        .from("organization_domains")
        .delete()
        .eq("id", domainId);

      if (error) throw error;

      setDomains(domains.filter(d => d.id !== domainId));
      toast.success("Domain removed");
    } catch (error: any) {
      console.error("Error removing domain:", error);
      toast.error("Failed to remove domain");
    }
  };

  const sendInvite = async () => {
    if (!newInviteEmail.trim() || !organization) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newInviteEmail.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingInvite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("instructor_invites")
        .insert({
          org_id: organization.id,
          email: newInviteEmail.trim().toLowerCase(),
          invited_by: user?.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error("An invite for this email already exists");
        } else {
          throw error;
        }
        return;
      }

      setInvites([data, ...invites]);
      setNewInviteEmail("");
      toast.success("Invite created! When they sign up, they'll auto-join your organization.");
    } catch (error: any) {
      console.error("Error sending invite:", error);
      toast.error(error.message || "Failed to send invite");
    } finally {
      setSendingInvite(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from("instructor_invites")
        .update({ status: 'cancelled' })
        .eq("id", inviteId);

      if (error) throw error;

      setInvites(invites.map(i => i.id === inviteId ? { ...i, status: 'cancelled' } : i));
      toast.success("Invite cancelled");
    } catch (error: any) {
      console.error("Error cancelling invite:", error);
      toast.error("Failed to cancel invite");
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    if (isExpired && status === 'pending') {
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Expired</Badge>;
    }
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600"><Check className="w-3 h-3 mr-1" />Accepted</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><X className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse">Loading organization...</div>
        </CardContent>
      </Card>
    );
  }

  if (!organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Create Your Organization
          </CardTitle>
          <CardDescription>
            Set up your school or organization to start managing instructors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization Name</Label>
            <Input
              id="orgName"
              placeholder="e.g., Stanford University"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgSlug">Organization Slug (URL-friendly)</Label>
            <Input
              id="orgSlug"
              placeholder="e.g., stanford-cs"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
            />
          </div>
          <Button
            onClick={createOrganization}
            disabled={creating}
            className="w-full"
          >
            {creating ? "Creating..." : "Create Organization"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {organization.name}
          </CardTitle>
          <CardDescription>
            Manage how instructors join your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Slug:</span>
            <code className="px-2 py-1 bg-muted rounded text-sm">{organization.slug}</code>
          </div>
        </CardContent>
      </Card>

      {/* Email Domain Matching */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5" />
            Auto-Join Domains
          </CardTitle>
          <CardDescription>
            Instructors with these email domains will automatically join your organization when they sign up
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g., stanford.edu"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              disabled={addingDomain}
            />
            <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {domains.length > 0 ? (
            <div className="space-y-2">
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono">{domain.domain}</span>
                    {domain.verified && (
                      <Badge variant="default" className="bg-green-600">Verified</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeDomain(domain.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No domains added yet. Add your institution's email domain to enable auto-join.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Direct Invites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5" />
            Invite Instructors
          </CardTitle>
          <CardDescription>
            Send direct invites to specific instructors by email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="instructor@example.com"
              value={newInviteEmail}
              onChange={(e) => setNewInviteEmail(e.target.value.toLowerCase())}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              disabled={sendingInvite}
            />
            <Button onClick={sendInvite} disabled={sendingInvite || !newInviteEmail.trim()}>
              <Mail className="w-4 h-4 mr-1" />
              Invite
            </Button>
          </div>

          {invites.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-mono text-sm">{invite.email}</TableCell>
                    <TableCell>{getStatusBadge(invite.status, invite.expires_at)}</TableCell>
                    <TableCell>
                      {invite.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelInvite(invite.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {invites.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No invites sent yet. Invited instructors will auto-join when they sign up.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
