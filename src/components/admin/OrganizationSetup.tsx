import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Building2, Users, Key } from "lucide-react";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  slug: string;
  admin_code: string;
  instructor_invite_code: string;
  created_at: string;
}

export default function OrganizationSetup() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's org_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (profile?.org_id) {
        // Fetch organization details
        const { data: org } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.org_id)
          .single();

        setOrganization(org);
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
    } finally {
      setLoading(false);
    }
  };

  const createOrganization = async () => {
    if (!orgName.trim() || !orgSlug.trim()) {
      toast.error("Please enter both organization name and slug");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate codes
      const { data: adminCode } = await supabase.rpc("generate_admin_code");
      const { data: inviteCode } = await supabase.rpc("generate_org_invite_code");

      // Create organization
      const { data: newOrg, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: orgName,
          slug: orgSlug.toLowerCase().replace(/\s+/g, "-"),
          admin_code: adminCode,
          instructor_invite_code: inviteCode,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Update admin profile with org_id
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ org_id: newOrg.id })
        .eq("id", user.id);

      if (profileError) throw profileError;

      setOrganization(newOrg);
      toast.success("Organization created successfully!");
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
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
            Set up your school or organization to start managing instructors and students
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {organization.name}
          </CardTitle>
          <CardDescription>Organization Details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Organization Slug</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-sm">
                {organization.slug}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Admin Code
          </CardTitle>
          <CardDescription>
            Share this code with other administrators to give them access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg py-2 px-4">
              {organization.admin_code}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(organization.admin_code, "Admin code")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Instructor Invite Code
          </CardTitle>
          <CardDescription>
            Share this code with instructors to invite them to your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg py-2 px-4">
              {organization.instructor_invite_code}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(organization.instructor_invite_code, "Invite code")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
