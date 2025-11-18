import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Building2, Key } from "lucide-react";
import { toast } from "sonner";

export default function AdminOnboarding() {
  const [adminCode, setAdminCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [createNew, setCreateNew] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    checkExistingOrg();
  }, []);

  const checkExistingOrg = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/admin/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, onboarded")
      .eq("id", user.id)
      .single();

    if (profile?.org_id && profile?.onboarded) {
      navigate("/admin/dashboard");
    }
  };

  const handleJoinOrganization = async () => {
    if (!adminCode.trim()) {
      toast.error("Please enter an admin code");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate admin code
      const { data: orgId, error: validateError } = await supabase
        .rpc("validate_admin_code", { _code: adminCode.toUpperCase() });

      if (validateError || !orgId) {
        throw new Error("Invalid admin code");
      }

      // Update profile with org_id
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ org_id: orgId, onboarded: true })
        .eq("id", user.id);

      if (updateError) throw updateError;

      toast.success("Successfully joined organization!");
      navigate("/admin/dashboard");
    } catch (error: any) {
      console.error("Error joining organization:", error);
      toast.error(error.message || "Failed to join organization");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!orgName.trim() || !orgSlug.trim()) {
      toast.error("Please enter both organization name and slug");
      return;
    }

    setLoading(true);
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

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ org_id: newOrg.id, onboarded: true })
        .eq("id", user.id);

      if (updateError) throw updateError;

      toast.success("Organization created successfully!");
      navigate("/admin/dashboard");
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Admin Setup
          </CardTitle>
          <CardDescription>
            Join an existing organization or create a new one
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!createNew ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="adminCode" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Admin Code
                </Label>
                <Input
                  id="adminCode"
                  placeholder="ADM-XXXXXXXX"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
                  maxLength={12}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the admin code provided by your organization
                </p>
              </div>
              <Button
                onClick={handleJoinOrganization}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Joining..." : "Join Organization"}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setCreateNew(true)}
                className="w-full"
              >
                Create New Organization
              </Button>
            </>
          ) : (
            <>
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
                <Label htmlFor="orgSlug">Organization Slug</Label>
                <Input
                  id="orgSlug"
                  placeholder="e.g., stanford-cs"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreateOrganization}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Creating..." : "Create Organization"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCreateNew(false)}
                className="w-full"
              >
                Back to Join
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
