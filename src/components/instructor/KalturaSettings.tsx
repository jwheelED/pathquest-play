import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface KalturaSettingsProps {
  instructorId: string;
}

export const KalturaSettings = ({ instructorId }: KalturaSettingsProps) => {
  const [partnerId, setPartnerId] = useState("");
  const [uiConfId, setUiConfId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("kaltura_partner_id, kaltura_uiconf_id")
        .eq("id", instructorId)
        .single();
      if (data) {
        setPartnerId(data.kaltura_partner_id || "");
        setUiConfId(data.kaltura_uiconf_id || "");
        if (data.kaltura_partner_id && data.kaltura_uiconf_id) setSaved(true);
      }
    };
    load();
  }, [instructorId]);

  const handleSave = async () => {
    if (!partnerId.trim() || !uiConfId.trim()) {
      toast.error("Both Partner ID and UI Conf ID are required");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        kaltura_partner_id: partnerId.trim(),
        kaltura_uiconf_id: uiConfId.trim(),
      })
      .eq("id", instructorId);

    setSaving(false);
    if (error) {
      toast.error("Failed to save Kaltura settings");
    } else {
      toast.success("Kaltura settings saved");
      setSaved(true);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Kaltura Integration</CardTitle>
          </div>
          {saved && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Configured
            </Badge>
          )}
        </div>
        <CardDescription>
          Connect your institution's Kaltura account to use Kaltura-hosted videos with full interactive controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="kaltura-partner-id">Partner ID</Label>
          <Input
            id="kaltura-partner-id"
            placeholder="e.g. 2345682"
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setSaved(false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Found in your Kaltura KMC under Settings → Integration Settings
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kaltura-uiconf-id">Player UI Conf ID</Label>
          <Input
            id="kaltura-uiconf-id"
            placeholder="e.g. 44740542"
            value={uiConfId}
            onChange={(e) => {
              setUiConfId(e.target.value);
              setSaved(false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Found in KMC under Studio → select your player → look at the URL or player details
          </p>
        </div>
        <div className="flex items-center justify-between">
          <a
            href="https://knowledge.kaltura.com/help/how-to-retrieve-the-partner-id-api-admin-secret-and-api-user-secret"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            How to find these values
          </a>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
