import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Copy, Download, ArrowLeft, Pencil, Link2, XCircle } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const JOIN_BASE_URL = "https://edvana.dev/join";

const DURATION_LABELS: Record<string, string> = {
  "1_hour": "1 hour",
  "2_hours": "2 hours",
  "4_hours": "4 hours",
  "full_day": "Full day",
};

type EventStatus = "scheduled" | "ready" | "live" | "completed" | "cancelled";

interface ScheduledEvent {
  id: string;
  event_name: string;
  event_date: string;
  start_time: string;
  duration: string;
  expected_attendance: number;
  tier: string;
  capacity_tier: string;
  price_cents: number;
  join_method: string;
  require_name: boolean;
  show_live_results: boolean;
  status: EventStatus;
  session_code: string | null;
}

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<ScheduledEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [displayStatus, setDisplayStatus] = useState<EventStatus>("scheduled");

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await (supabase as any)
      .from("scheduled_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error || !data) {
      toast.error("Event not found");
      navigate("/dashboard");
      return;
    }
    setEvent(data as unknown as ScheduledEvent);
    setLoading(false);
  }, [eventId, navigate]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Generate QR code
  useEffect(() => {
    if (!event?.session_code) return;
    const joinUrl = `${JOIN_BASE_URL}?code=${event.session_code}`;
    QRCode.toDataURL(joinUrl, { width: 256, margin: 2 }).then(setQrDataUrl).catch(() => {});
  }, [event?.session_code]);

  // Time-based status
  useEffect(() => {
    if (!event) return;

    const checkStatus = () => {
      if (event.status === "live" || event.status === "completed" || event.status === "cancelled") {
        setDisplayStatus(event.status);
        return;
      }

      const eventDateTime = new Date(`${event.event_date}T${event.start_time}`);
      const now = new Date();
      const diffMs = eventDateTime.getTime() - now.getTime();
      const diffMin = diffMs / 60000;

      if (diffMin <= 30 && diffMin > 0) {
        setDisplayStatus("ready");
      } else if (diffMin <= 0) {
        setDisplayStatus("ready");
      } else {
        setDisplayStatus("scheduled");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, [event]);

  const handleStartLive = async () => {
    if (!event) return;
    const { error } = await (supabase as any)
      .from("scheduled_events")
      .update({ status: "live" })
      .eq("id", event.id);

    if (error) {
      toast.error("Failed to start event");
      return;
    }
    toast.success("Event is now live!");
    setEvent({ ...event, status: "live" });
  };

  const handleCancel = async () => {
    if (!event) return;
    const { error } = await (supabase as any)
      .from("scheduled_events")
      .update({ status: "cancelled" })
      .eq("id", event.id);

    if (error) {
      toast.error("Failed to cancel event");
      return;
    }
    toast.success("Event cancelled");
    setEvent({ ...event, status: "cancelled" });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${event?.event_name || "event"}-qr.png`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading event…</p>
      </div>
    );
  }

  if (!event) return null;

  const eventDateTime = new Date(`${event.event_date}T${event.start_time}`);
  const activatesAt = new Date(eventDateTime.getTime() - 30 * 60000);
  const joinUrl = `${JOIN_BASE_URL}?code=${event.session_code}`;

  const statusConfig: Record<EventStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    scheduled: { label: "Scheduled", variant: "secondary" },
    ready: { label: "Ready", variant: "outline" },
    live: { label: "Live", variant: "default" },
    completed: { label: "Completed", variant: "secondary" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };

  const statusInfo = statusConfig[displayStatus];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold text-foreground truncate">{event.event_name}</h1>
          <Badge variant={statusInfo.variant} className="ml-auto flex items-center gap-1.5">
            {displayStatus === "live" && (
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
            {statusInfo.label}
          </Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Top info */}
        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <span>{format(parseISO(event.event_date), "EEEE, MMMM d, yyyy")}</span>
          <span>{event.start_time}</span>
          <span>{DURATION_LABELS[event.duration] || event.duration}</span>
          <span>Up to {event.capacity_tier.replace("up_to_", "")} attendees</span>
        </div>

        {/* Join section */}
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-4xl font-mono font-bold tracking-[0.25em] text-foreground">
                  {event.session_code || "——"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(event.session_code || "", "Session code")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Join URL:</span>
                <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">{joinUrl}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(joinUrl, "Join link")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {qrDataUrl && (
            <Card className="w-fit">
              <CardContent className="p-4 flex flex-col items-center gap-3">
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded" />
                <Button variant="outline" size="sm" onClick={downloadQR}>
                  <Download className="w-4 h-4 mr-1" /> Download QR
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* State-aware CTA */}
        <Card>
          <CardContent className="py-6 flex items-center justify-between">
            {displayStatus === "scheduled" && (
              <>
                <div>
                  <p className="font-medium text-foreground">Start Live</p>
                  <p className="text-sm text-muted-foreground">
                    Activates at {format(activatesAt, "h:mm a")}
                  </p>
                </div>
                <Button disabled className="opacity-50">
                  Start Live
                </Button>
              </>
            )}
            {displayStatus === "ready" && event.status !== "live" && (
              <>
                <div>
                  <p className="font-medium text-foreground">Your session window is open</p>
                  <p className="text-sm text-muted-foreground">
                    Start when your room is ready.
                  </p>
                </div>
                <Button onClick={handleStartLive}>
                  Start Live
                </Button>
              </>
            )}
            {(displayStatus === "live" || event.status === "live") && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <p className="font-medium text-foreground">Session Live</p>
                </div>
                <Badge variant="outline" className="text-sm">In Progress</Badge>
              </>
            )}
            {(displayStatus === "completed" || displayStatus === "cancelled") && (
              <p className="text-muted-foreground text-sm">This event has ended.</p>
            )}
          </CardContent>
        </Card>

        {/* Event details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Duration</span>
                <p className="font-medium text-foreground">{DURATION_LABELS[event.duration] || event.duration}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Capacity tier</span>
                <p className="font-medium text-foreground">Up to {event.capacity_tier.replace("up_to_", "")} attendees</p>
              </div>
              <div>
                <span className="text-muted-foreground">Join method</span>
                <p className="font-medium text-foreground capitalize">{event.join_method.replace("_", " ")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tier</span>
                <p className="font-medium text-foreground capitalize">{event.tier}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Require name</span>
                <p className="font-medium text-foreground">{event.require_name ? "Yes" : "No"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Show live results</span>
                <p className="font-medium text-foreground">{event.show_live_results ? "Yes" : "No"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        {event.status !== "cancelled" && event.status !== "completed" && (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => toast.info("Edit coming soon")}>
              <Pencil className="w-4 h-4 mr-1" /> Edit Event
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(joinUrl, "Join link")}>
              <Link2 className="w-4 h-4 mr-1" /> Copy Join Link
            </Button>
            {qrDataUrl && (
              <Button variant="outline" size="sm" onClick={downloadQR}>
                <Download className="w-4 h-4 mr-1" /> Download QR Code
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleCancel}>
              <XCircle className="w-4 h-4 mr-1" /> Cancel Event
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetail;
