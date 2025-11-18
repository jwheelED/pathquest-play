import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function InstructorOrgOnboarding() {
  const [orgCode, setOrgCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkExistingOrg();
  }, []);

  const checkExistingOrg = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/instructor/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, onboarded")
      .eq("id", user.id)
      .single();

    if (profile?.org_id && profile?.onboarded) {
      navigate("/instructor/onboarding");
    }
  };

  const handleJoinOrganization = async () => {
    if (!orgCode.trim()) {
      toast.error("Please enter an organization code");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate org invite code
      const { data: orgId, error: validateError } = await supabase
        .rpc("validate_org_invite_code", { _code: orgCode.toUpperCase() });

      if (validateError || !orgId) {
        throw new Error("Invalid organization code");
      }

      // Update profile with org_id
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ org_id: orgId })
        .eq("id", user.id);

      if (updateError) throw updateError;

      toast.success("Successfully joined organization!");
      navigate("/instructor/onboarding");
    } catch (error: any) {
      console.error("Error joining organization:", error);
      toast.error(error.message || "Failed to join organization");
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
            Join Your Organization
          </CardTitle>
          <CardDescription>
            Enter the organization code provided by your administrator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgCode">Organization Code</Label>
            <Input
              id="orgCode"
              placeholder="ORG-XXXXXXXX"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              maxLength={12}
            />
            <p className="text-sm text-muted-foreground">
              This code allows you to join your school or organization
            </p>
          </div>
          <Button
            onClick={handleJoinOrganization}
            disabled={loading || !orgCode.trim()}
            className="w-full"
          >
            {loading ? "Joining..." : (
              <>
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
