import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Info, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DefaultOrgInfo() {
  const [showInfo, setShowInfo] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null);

  useEffect(() => {
    checkIfDefaultOrg();
  }, []);

  const checkIfDefaultOrg = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    // Check if user is in the default organization
    if (profile?.org_id === "00000000-0000-0000-0000-000000000001") {
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .single();

      setOrgDetails(org);
      setShowInfo(true);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  if (!showInfo || !orgDetails) return null;

  return (
    <Alert className="border-accent bg-accent/5">
      <Info className="h-4 w-4" />
      <AlertTitle>Default Organization</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          Your existing data has been migrated to the "Default Organization". 
          You can continue using this organization or create a new one.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Admin Code:</span>
            <Badge variant="outline" className="font-mono">
              {orgDetails.admin_code}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(orgDetails.admin_code, "Admin code")}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Instructor Code:</span>
            <Badge variant="outline" className="font-mono">
              {orgDetails.instructor_invite_code}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(orgDetails.instructor_invite_code, "Invite code")}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowInfo(false)}
          className="mt-2"
        >
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
