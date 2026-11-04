import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/* ── Pricing lookup ── */
type Duration = "1_hour" | "2_hours" | "4_hours" | "full_day";
type Tier = "self-serve" | "premium";

const DURATION_LABELS: Record<Duration, string> = {
  "1_hour": "1 hour",
  "2_hours": "2 hours",
  "4_hours": "4 hours",
  "full_day": "Full day",
};

const SELF_SERVE_PRICES: Record<string, Record<Duration, number>> = {
  "50":  { "1_hour": 2900, "2_hours": 4900, "4_hours": 7900, "full_day": 12900 },
  "150": { "1_hour": 6900, "2_hours": 11900, "4_hours": 17900, "full_day": 27900 },
  "300": { "1_hour": 12900, "2_hours": 21900, "4_hours": 32900, "full_day": 39900 },
};

const PREMIUM_PRICES: Record<string, Record<string, number>> = {
  "300": { "1_hour": 39900, "2_hours": 64900, "4_hours": 89900 },
  "500": { "1_hour": 59900, "2_hours": 94900, "4_hours": 129900 },
};

function getCapacityTier(attendance: number, tier: Tier): string {
  if (tier === "premium") {
    if (attendance <= 300) return "300";
    return "500";
  }
  if (attendance <= 50) return "50";
  if (attendance <= 150) return "150";
  return "300";
}

function getPrice(duration: Duration, capacityTier: string, tier: Tier): number | null {
  const table = tier === "self-serve" ? SELF_SERVE_PRICES : PREMIUM_PRICES;
  return table[capacityTier]?.[duration] ?? null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

/* ── Component ── */
const CreateEvent = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState<Date>();
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState<Duration>("2_hours");
  const [attendance, setAttendance] = useState<number | "">("");

  // Step 2
  const [tier, setTier] = useState<Tier>("self-serve");

  // Step 3
  const [joinMethod, setJoinMethod] = useState("both");
  const [requireName, setRequireName] = useState(false);
  const [showLiveResults, setShowLiveResults] = useState(false);

  const attendanceNum = typeof attendance === "number" ? attendance : 0;
  const capacityTier = getCapacityTier(attendanceNum, tier);
  const price = duration ? getPrice(duration, capacityTier, tier) : null;

  const canProceedStep1 = eventName.trim() && eventDate && startTime && duration && attendanceNum > 0;
  const canProceedStep2 = price !== null;

  // Auto-recommend tier based on attendance
  const recommendedTier: Tier = attendanceNum > 300 ? "premium" : "self-serve";

  const handleSubmit = async () => {
    if (!eventDate || !price) return;
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to create an event");
        navigate("/auth");
        return;
      }

      const { data, error } = await (supabase as any)
        .from("scheduled_events")
        .insert({
          organizer_id: user.id,
          event_name: eventName.trim(),
          event_date: format(eventDate, "yyyy-MM-dd"),
          start_time: startTime,
          duration,
          expected_attendance: attendanceNum,
          tier,
          capacity_tier: `up_to_${capacityTier}`,
          price_cents: price,
          join_method: joinMethod,
          require_name: requireName,
          show_live_results: showLiveResults,
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success(tier === "self-serve" ? "Event created!" : "Event submitted for review!");
      navigate(`/events/${(data as { id: string }).id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create event";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Summary Panel ── */
  const SummaryPanel = () => (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Event Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Event</span>
          <span className="font-medium text-foreground truncate ml-4 max-w-[180px]">
            {eventName || "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium text-foreground">
            {eventDate ? format(eventDate, "MMM d, yyyy") : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Time</span>
          <span className="font-medium text-foreground">{startTime || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-medium text-foreground">
            {duration ? DURATION_LABELS[duration] : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Capacity</span>
          <span className="font-medium text-foreground">
            {attendanceNum > 0 ? `Up to ${capacityTier}` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tier</span>
          <span className="font-medium text-foreground capitalize">{tier}</span>
        </div>
        <div className="border-t border-border pt-3 flex justify-between">
          <span className="font-semibold text-foreground">Total</span>
          <span className="font-bold text-foreground text-lg">
            {price !== null ? formatCents(price) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Create Event</h1>
        </div>
      </header>

      {/* Step indicator */}
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 text-sm">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold",
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={cn("hidden sm:inline", step >= s ? "text-foreground" : "text-muted-foreground")}>
                {s === 1 ? "Basics" : s === 2 ? "Tier" : "Settings"}
              </span>
              {s < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main form */}
          <div>
            {/* Step 1 */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Event Basics</CardTitle>
                  <CardDescription>Tell us about your event.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="event-name">Event name</Label>
                    <Input
                      id="event-name"
                      placeholder="Q2 All-Hands Meeting"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left font-normal", !eventDate && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {eventDate ? format(eventDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={eventDate}
                            onSelect={setEventDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="start-time">Start time</Label>
                      <Input
                        id="start-time"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={duration} onValueChange={(v) => setDuration(v as Duration)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DURATION_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="attendance">Expected attendance</Label>
                    <Input
                      id="attendance"
                      type="number"
                      min={1}
                      max={500}
                      placeholder="150"
                      value={attendance === "" ? "" : attendance}
                      onChange={(e) => setAttendance(e.target.value ? parseInt(e.target.value) : "")}
                    />
                    <p className="text-xs text-muted-foreground">
                      We use this to recommend your tier. You can upgrade live if you need to.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button disabled={!canProceedStep1} onClick={() => setStep(2)}>
                      Next <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Choose Your Tier</CardTitle>
                  <CardDescription>
                    Based on {attendanceNum} attendees, we recommend{" "}
                    <span className="font-semibold capitalize">{recommendedTier}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(["self-serve", "premium"] as const).map((t) => {
                      const isRecommended = t === recommendedTier;
                      const isSelected = t === tier;
                      const tierPrice = getPrice(duration, getCapacityTier(attendanceNum, t), t);
                      const available = tierPrice !== null;

                      return (
                        <button
                          key={t}
                          disabled={!available}
                          onClick={() => setTier(t)}
                          className={cn(
                            "relative text-left rounded-lg border-2 p-5 transition-all",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40",
                            !available && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {isRecommended && (
                            <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                              Recommended
                            </span>
                          )}
                          <h3 className="font-semibold text-foreground capitalize mb-1">{t === "self-serve" ? "Self-Serve" : "Premium"}</h3>
                          <p className="text-xs text-muted-foreground mb-3">
                            {t === "self-serve"
                              ? "For most events. No setup call required."
                              : "For high-stakes or supported events."}
                          </p>
                          {available && (
                            <p className="text-2xl font-bold text-foreground">
                              {formatCents(tierPrice)}
                            </p>
                          )}
                          {!available && (
                            <p className="text-sm text-muted-foreground">
                              Not available for this duration
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button disabled={!canProceedStep2} onClick={() => setStep(3)}>
                      Next <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Join Settings</CardTitle>
                  <CardDescription>Configure how participants join your event.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Join method</Label>
                    <RadioGroup value={joinMethod} onValueChange={setJoinMethod} className="space-y-2">
                      {[
                        { value: "both", label: "QR code and session code" },
                        { value: "qr_only", label: "QR code only" },
                        { value: "code_only", label: "Session code only" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-3">
                          <RadioGroupItem value={opt.value} id={opt.value} />
                          <Label htmlFor={opt.value} className="font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Require participant name</Label>
                      <p className="text-xs text-muted-foreground">Participants must enter their name to join.</p>
                    </div>
                    <Switch checked={requireName} onCheckedChange={setRequireName} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Show live results to participants</Label>
                      <p className="text-xs text-muted-foreground">Participants see aggregated responses in real time.</p>
                    </div>
                    <Switch checked={showLiveResults} onCheckedChange={setShowLiveResults} />
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting
                        ? "Creating…"
                        : tier === "self-serve"
                        ? "Confirm and Pay"
                        : "Submit for Review"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Summary sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <SummaryPanel />
            </div>
          </div>
        </div>

        {/* Mobile summary bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background px-6 py-3 flex items-center justify-between z-20">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold text-foreground">{price !== null ? formatCents(price) : "—"}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">{eventName || "New Event"}</p>
        </div>
      </div>
    </div>
  );
};

export default CreateEvent;
