import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { bulkSyncGradesToLMS } from "@/lib/lmsSync";
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Key,
  Send,
} from "lucide-react";

interface LMSPlatform {
  id: string;
  platform_name: string;
  platform_type: string;
  issuer: string;
  client_id: string;
  is_active: boolean;
  created_at: string;
  org_id: string | null;
}

interface LMSIntegrationSettingsProps {
  mode?: "instructor" | "admin";
}

interface GradeSyncLog {
  id: string;
  assignment_type: string;
  score_given: number;
  score_maximum: number;
  sync_status: string;
  error_message: string | null;
  synced_at: string;
}

const LMS_OPTIONS = [
  {
    value: "canvas",
    label: "Canvas",
    icon: "🎨",
    description: "Instructure Canvas LMS",
    helpUrl: "https://www.youtube.com/watch?v=cZ5cn8stjM0&t=101s",
    urlPlaceholder: "https://your-school.instructure.com",
    tokenHelp: "Go to Canvas → Account → Settings → New Access Token",
    steps: [
      "Log in to your Canvas account at your institution's URL (e.g. your-school.instructure.com).",
      "Click your profile picture (top-left) → Settings.",
      "Scroll down to \"Approved Integrations\" and click + New Access Token.",
      "Enter a purpose like \"Edvana Grade Sync\" and leave the expiry blank (or set one).",
      "Click Generate Token — copy the token immediately (you won't see it again).",
      "Paste the full Canvas URL and the token below.",
    ],
  },
  {
    value: "blackboard",
    label: "Blackboard",
    icon: "📚",
    description: "Blackboard Learn",
    helpUrl: "https://developer.anthology.com/portal/displayApi",
    urlPlaceholder: "https://your-school.blackboard.com",
    tokenHelp: "Go to Admin → REST API Integrations → Create Integration",
    steps: [
      "Log in to Blackboard Learn as an Administrator.",
      "Go to System Admin → Integrations → REST API Integrations.",
      "Click Create Integration — set a name like \"Edvana\" and a description.",
      "Set the Authorized User to your admin account and End User Access to \"Yes\".",
      "After saving, copy the Application Key (this is your API token).",
      "Paste your Blackboard URL (e.g. your-school.blackboard.com) and the Application Key below.",
    ],
  },
  {
    value: "moodle",
    label: "Moodle",
    icon: "🎓",
    description: "Moodle LMS",
    helpUrl:
      "https://supportus.moodle.com/support/solutions/articles/80001016973-using-the-web-services-application-programming-interface-api-in-moodle",
    urlPlaceholder: "https://your-moodle-site.edu",
    tokenHelp: "Go to Site Admin → Plugins → Web services → Manage tokens",
    steps: [
      "Log in to Moodle as a Site Administrator.",
      "Go to Site Administration → Server → Web services → Overview and follow the setup checklist.",
      "Enable web services (Step 1) and enable the REST protocol (Step 2).",
      "Create a specific user or use your admin account, then create a new Service with the functions: core_course_get_courses, mod_assign_save_grade.",
      "Go to Site Administration → Server → Web services → Manage tokens.",
      "Create a token for the user/service you configured — copy it and paste it below along with your Moodle site URL.",
    ],
  },
  {
    value: "brightspace",
    label: "D2L Brightspace",
    icon: "💡",
    description: "D2L Brightspace",
    helpUrl: "https://docs.valence.desire2learn.com/",
    urlPlaceholder: "https://your-brightspace.edu",
    tokenHelp: "Contact your Brightspace admin for API credentials",
    steps: [
      "Ask your institution's Brightspace administrator to create an OAuth 2.0 API application for Edvana.",
      "The admin goes to Admin Tools → Manage Extensibility → OAuth 2.0 and registers a new app.",
      "Scopes needed: grades:write, enrollments:read (at minimum).",
      "After approval, the admin will provide you with a Bearer token (or you'll complete an OAuth flow to get one).",
      "Enter your Brightspace instance URL (e.g. your-school.brightspace.com) and the Bearer token below.",
    ],
  },
];

export function LMSIntegrationSettings({ mode = "instructor" }: LMSIntegrationSettingsProps) {
  const isAdmin = mode === "admin";
  const [platforms, setPlatforms] = useState<LMSPlatform[]>([]);
  const [syncLogs, setSyncLogs] = useState<GradeSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Wizard state
  const [step, setStep] = useState<"list" | "select" | "connect">("list");
  const [selectedLMS, setSelectedLMS] = useState<(typeof LMS_OPTIONS)[0] | null>(null);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    fetchPlatforms();
    fetchSyncLogs();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const { data, error } = await supabase
        .from("lti_platforms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPlatforms(data || []);
    } catch (error) {
      console.error("Error fetching platforms:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("grade_sync_log")
        .select("id, assignment_type, score_given, score_maximum, sync_status, error_message, synced_at")
        .order("synced_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setSyncLogs(data || []);
    } catch (error) {
      console.error("Error fetching sync logs:", error);
    }
  };

  const handleConnect = async () => {
    if (!selectedLMS || !instanceUrl || !apiToken) {
      toast.error("Please fill in both fields");
      return;
    }
    setIsConnecting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();

      const { error } = await supabase.from("lti_platforms").insert({
        org_id: profile?.org_id,
        platform_type: selectedLMS.value,
        platform_name: `${selectedLMS.label} — ${new URL(instanceUrl).hostname}`,
        issuer: instanceUrl,
        client_id: apiToken,
        auth_url: instanceUrl,
        token_url: instanceUrl,
        jwks_url: instanceUrl,
      });

      if (error) throw error;

      toast.success(`${selectedLMS.label} connected successfully!`);
      fetchPlatforms();
      resetWizard();
    } catch (error: any) {
      console.error("Error connecting:", error);
      toast.error(error.message || "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  const togglePlatformActive = async (platformId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("lti_platforms").update({ is_active: !isActive }).eq("id", platformId);
      if (error) throw error;
      toast.success(`Platform ${isActive ? "disabled" : "enabled"}`);
      fetchPlatforms();
    } catch {
      toast.error("Failed to update platform status");
    }
  };

  const handleBulkSync = async () => {
    setIsSyncing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get recent graded assignments for this instructor's students
      const { data: assignments, error } = await supabase
        .from("student_assignments")
        .select("id, student_id, grade, assignment_type")
        .eq("instructor_id", user.id)
        .eq("completed", true)
        .not("grade", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!assignments || assignments.length === 0) {
        toast.info("No graded assignments to sync");
        return;
      }

      const grades = assignments.map((a) => ({
        assignmentId: a.id,
        studentId: a.student_id,
        scoreGiven: a.grade ?? 0,
        scoreMaximum: 100,
        assignmentType: a.assignment_type,
      }));

      const { success, failed } = await bulkSyncGradesToLMS(grades);

      if (failed === 0) {
        toast.success(`${success} grade(s) synced to LMS`);
      } else {
        toast.warning(`${success} synced, ${failed} failed`);
      }

      fetchSyncLogs();
    } catch (err: any) {
      console.error("Bulk sync error:", err);
      toast.error(err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const resetWizard = () => {
    setStep("list");
    setSelectedLMS(null);
    setInstanceUrl("");
    setApiToken("");
  };

  // Step: Select LMS type
  if (step === "select") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetWizard} className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-base">Choose Your LMS</CardTitle>
              <CardDescription>Select the platform your institution uses</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {LMS_OPTIONS.map((lms) => (
            <button
              key={lms.value}
              onClick={() => {
                setSelectedLMS(lms);
                setStep("connect");
              }}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-accent/50 transition-all text-center"
            >
              <span className="text-2xl">{lms.icon}</span>
              <span className="font-medium text-sm">{lms.label}</span>
              <span className="text-xs text-muted-foreground">{lms.description}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Step: Enter credentials
  if (step === "connect" && selectedLMS) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span>{selectedLMS.icon}</span> Connect {selectedLMS.label}
              </CardTitle>
              <CardDescription>Just two things needed — your LMS URL and an API token</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step-by-step instructions */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">How to get your {selectedLMS.label} API token:</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              {selectedLMS.steps.map((s, i) => (
                <li key={i} className="leading-relaxed">{s}</li>
              ))}
            </ol>
            <a
              href={selectedLMS.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" /> Full guide
            </a>
          </div>

          <div className="space-y-2">
            <Label>Your {selectedLMS.label} URL</Label>
            <Input
              placeholder={selectedLMS.urlPlaceholder}
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Key className="h-3 w-3" /> API Token
            </Label>
            <Input
              type="password"
              placeholder="Paste your API token here"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>

          <Button onClick={handleConnect} disabled={isConnecting} className="w-full">
            {isConnecting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Connecting...
              </>
            ) : (
              <>
                Connect {selectedLMS.label} <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Default: List view
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5" />
          LMS Integration
        </CardTitle>
        <CardDescription>Connect your LMS for automatic grade sync</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected platforms */}
        {platforms.map((platform) => (
          <div key={platform.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {platform.is_active ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">{platform.platform_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{platform.platform_type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={platform.is_active ? "default" : "secondary"} className="text-xs">
                {platform.is_active ? "Active" : "Off"}
              </Badge>
              <Switch
                checked={platform.is_active}
                onCheckedChange={() => togglePlatformActive(platform.id, platform.is_active)}
              />
            </div>
          </div>
        ))}

        {/* Recent syncs summary */}
        {syncLogs.length > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p className="font-medium mb-1">Recent syncs</p>
            {syncLogs.slice(0, 3).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-1">
                <span className="capitalize">{log.assignment_type.replace("_", " ")}</span>
                <span className="flex items-center gap-1">
                  {log.score_given}/{log.score_maximum}
                  {log.sync_status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {platforms.length > 0 && (
          <Button variant="default" className="w-full" onClick={handleBulkSync} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Syncing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Sync Grades Now
              </>
            )}
          </Button>
        )}

        <Button variant="outline" className="w-full" onClick={() => setStep("select")}>
          <GraduationCap className="h-4 w-4 mr-2" />
          {platforms.length > 0 ? "Connect Another LMS" : "Connect Your LMS"}
        </Button>
      </CardContent>
    </Card>
  );
}
