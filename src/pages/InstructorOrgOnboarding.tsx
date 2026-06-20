import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ArrowRight, CheckCircle2, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function InstructorOrgOnboarding() {
  const [loading, setLoading] = useState(true);
  const [orgStatus, setOrgStatus] = useState<{
    connected: boolean;
    orgName: string | null;
    pendingInvite: boolean;
  }>({ connected: false, orgName: null, pendingInvite: false });
  const navigate = useNavigate();

  useEffect(() => {
    checkOrgStatus();
  }, []);

  const checkOrgStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/instructor/auth");
        return;
      }

      // Check profile for org_id and onboarded status
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, onboarded")
        .eq("id", user.id)
        .single();

      // If already onboarded, go to main onboarding
      if (profile?.onboarded) {
        navigate("/instructor/onboarding");
        return;
      }

      // Check if connected to org
      if (profile?.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.org_id)
          .single();

        setOrgStatus({
          connected: true,
          orgName: org?.name || null,
          pendingInvite: false,
        });
      } else {
        // Check for pending invite
        const { data: invite } = await supabase
          .from("instructor_invites")
          .select("id")
          .eq("status", "pending")
          .maybeSingle();

        setOrgStatus({
          connected: false,
          orgName: null,
          pendingInvite: !!invite,
        });
      }
    } catch (error) {
      console.error("Error checking org status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate("/instructor/onboarding");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="animate-pulse text-center">Checking organization status...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Organization Connection
          </CardTitle>
          <CardDescription>
            {orgStatus.connected 
              ? "You're connected to an organization!" 
              : "Connect to your institution for the full experience"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {orgStatus.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">Connected</p>
                  <p className="text-sm text-green-600 dark:text-green-500">{orgStatus.orgName}</p>
                </div>
              </div>
              <Button onClick={handleContinue} className="w-full">
                Continue to Setup <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <Clock className="w-6 h-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Not Connected Yet</p>
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    {orgStatus.pendingInvite 
                      ? "You have a pending invite - sign up to auto-join" 
                      : "No organization connection found"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to connect:</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Use your institutional email - you may auto-join if your domain is registered</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Ask your administrator to send you an invite</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <Button onClick={handleContinue} className="w-full">
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
