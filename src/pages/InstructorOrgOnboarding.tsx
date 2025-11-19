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

    if (profile?.onboarded) {
      navigate("/instructor/onboarding");
    }
  };

  const handleSkip = () => {
    toast.info("Skipping organization setup");
    navigate("/instructor/onboarding");
  };

  const handleJoinOrganization = async () => {
    if (!orgCode.trim()) {
      toast.error("Please enter an admin code");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Connect to admin using their code
      const { data: adminId, error: connectError } = await supabase
        .rpc("connect_instructor_to_admin", { _admin_code: orgCode.toUpperCase() });

      if (connectError || !adminId) {
        throw new Error(connectError?.message || "Invalid admin code");
      }

      toast.success("Successfully connected to administrator!");
      navigate("/instructor/onboarding");
    } catch (error: any) {
      console.error("Error connecting to admin:", error);
      toast.error(error.message || "Failed to connect to administrator");
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
            Connect to Administrator
          </CardTitle>
          <CardDescription>
            Enter the admin code provided by your administrator, or skip to continue independently
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgCode">Admin Code</Label>
            <Input
              id="orgCode"
              placeholder="ADM-XXXXXXXX"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              maxLength={12}
            />
            <p className="text-sm text-muted-foreground">
              This code connects you to your administrator's organization
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleJoinOrganization}
              disabled={loading || !orgCode.trim()}
              className="w-full"
            >
              {loading ? "Joining..." : (
                <>
                  Join Organization <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
            <Button
              onClick={handleSkip}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              Skip for now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            You can connect to an administrator later from your dashboard
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
