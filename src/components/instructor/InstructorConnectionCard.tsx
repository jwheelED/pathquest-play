import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function InstructorConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [connectionData, setConnectionData] = useState<{
    adminName: string | null;
    adminEmail: string | null;
    orgName: string | null;
    orgSlug: string | null;
  } | null>(null);
  const [adminCode, setAdminCode] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchConnectionData();
  }, []);

  const fetchConnectionData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get instructor's profile with org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) {
        setLoading(false);
        return;
      }

      // Get connected admin
      const { data: adminConnection } = await supabase
        .from("admin_instructors")
        .select("admin_id")
        .eq("instructor_id", user.id)
        .maybeSingle();

      // Get organization details
      const { data: org } = await supabase
        .from("organizations")
        .select("name, slug")
        .eq("id", profile.org_id)
        .single();

      let adminName = null;
      let adminEmail = null;

      if (adminConnection?.admin_id) {
        // Get admin profile
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", adminConnection.admin_id)
          .single();

        // Get admin auth data
        const { data: adminUser } = await supabase
          .from("users")
          .select("email")
          .eq("id", adminConnection.admin_id)
          .single();

        adminName = adminProfile?.full_name || null;
        adminEmail = adminUser?.email || null;
      }

      setConnectionData({
        adminName,
        adminEmail,
        orgName: org?.name || null,
        orgSlug: org?.slug || null,
      });
    } catch (error) {
      console.error("Error fetching connection data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectToAdmin = async () => {
    if (!adminCode.trim()) {
      toast.error("Please enter an admin code");
      return;
    }

    setConnecting(true);
    try {
      const { data, error } = await supabase.rpc("connect_instructor_to_admin", {
        _admin_code: adminCode.trim(),
      });

      if (error) throw error;

      toast.success("Successfully connected to administrator!");
      setAdminCode("");
      fetchConnectionData(); // Refresh the connection data
    } catch (error: any) {
      console.error("Error connecting to admin:", error);
      toast.error(error.message || "Failed to connect. Please check the admin code.");
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Show card even if no connection data yet
  const hasConnection = connectionData?.adminName || connectionData?.orgName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Organization & Admin Connection
        </CardTitle>
        <CardDescription>
          Your organization details and connected administrator
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Organization Info */}
        {connectionData?.orgName && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="w-4 h-4" />
                Organization
              </div>
              <div className="pl-6 space-y-1">
                <p className="text-lg font-semibold">{connectionData.orgName}</p>
                {connectionData.orgSlug && (
                  <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                    {connectionData.orgSlug}
                  </code>
                )}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Admin Info */}
        {connectionData?.adminName ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="w-4 h-4" />
              Connected Administrator
            </div>
            <div className="pl-6 space-y-1">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <p className="font-semibold">{connectionData.adminName}</p>
              </div>
              {connectionData.adminEmail && (
                <p className="text-sm text-muted-foreground">{connectionData.adminEmail}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="w-4 h-4" />
              Connect to Administrator
            </div>
            <div className="pl-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your administrator's code to connect to your organization
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter admin code (e.g., ADM-XXXXXXXX)"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleConnectToAdmin();
                    }
                  }}
                  disabled={connecting}
                  className="font-mono"
                />
                <Button 
                  onClick={handleConnectToAdmin} 
                  disabled={connecting || !adminCode.trim()}
                >
                  {connecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
