import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Shield, User, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export function InstructorConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [connectionData, setConnectionData] = useState<{
    adminName: string | null;
    adminEmail: string | null;
    orgName: string | null;
    orgSlug: string | null;
  } | null>(null);

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

  const isConnected = connectionData?.orgName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Organization Connection
        </CardTitle>
        <CardDescription>
          {isConnected 
            ? "You are connected to an organization" 
            : "You are not connected to an organization yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            {/* Organization Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="w-4 h-4" />
                Organization
              </div>
              <div className="pl-6 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{connectionData?.orgName}</p>
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                </div>
                {connectionData?.orgSlug && (
                  <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                    {connectionData.orgSlug}
                  </code>
                )}
              </div>
            </div>

            {/* Admin Info */}
            {connectionData?.adminName && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Shield className="w-4 h-4" />
                    Administrator
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
              </>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <Clock className="w-5 h-5" />
              <span className="font-medium">Pending Organization Connection</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You'll be automatically connected to an organization when:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 pl-2">
              <li>Your email domain matches an organization's allowed domains</li>
              <li>An administrator sends you a direct invite</li>
              <li>You're assigned a seat in an institutional license</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Contact your institution's administrator if you need to be connected.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
