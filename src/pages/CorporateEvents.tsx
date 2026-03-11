import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, isThisWeek, isThisMonth, parseISO } from "date-fns";
import {
  ArrowLeft, CalendarDays, Users, BarChart3, Plus, Search,
  Trash2, Edit, Download, Bell, Radio, LayoutDashboard,
  UserPlus, CalendarIcon, Clock, MapPin, Tag
} from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

// --- Types ---
interface CorporateEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  duration: number;
  format: "in-person" | "virtual" | "hybrid";
  location: string;
  maxAttendees: number;
  registeredCount: number;
  status: "draft" | "published" | "live" | "completed";
  tags: string[];
}

interface Attendee {
  id: string;
  name: string;
  email: string;
  eventsRegistered: number;
  lastAttended: string | null;
  status: "confirmed" | "pending" | "cancelled";
}

// --- Mock Data ---
const MOCK_EVENTS: CorporateEvent[] = [
  { id: "1", title: "Q2 Leadership Summit", description: "Quarterly leadership alignment and strategy session.", date: "2026-04-15T09:00:00", duration: 120, format: "in-person", location: "HQ Conference Center", maxAttendees: 50, registeredCount: 38, status: "published", tags: ["Conference", "Keynote"] },
  { id: "2", title: "Product Design Workshop", description: "Hands-on design thinking workshop for product teams.", date: "2026-03-28T14:00:00", duration: 90, format: "virtual", location: "Zoom", maxAttendees: 30, registeredCount: 27, status: "published", tags: ["Workshop", "Training"] },
  { id: "3", title: "New Hire Onboarding", description: "Monthly onboarding session for new employees.", date: "2026-04-01T10:00:00", duration: 180, format: "hybrid", location: "Room 204 / Teams", maxAttendees: 20, registeredCount: 12, status: "draft", tags: ["Training"] },
  { id: "4", title: "Sales Kickoff 2026", description: "Annual sales team kickoff with keynotes and breakouts.", date: "2026-02-10T08:00:00", duration: 480, format: "in-person", location: "Grand Ballroom", maxAttendees: 200, registeredCount: 187, status: "completed", tags: ["Conference", "Keynote"] },
];

const MOCK_ATTENDEES: Attendee[] = [
  { id: "a1", name: "Jordan Rivera", email: "jordan@acme.com", eventsRegistered: 3, lastAttended: "2026-02-10", status: "confirmed" },
  { id: "a2", name: "Alex Chen", email: "alex.chen@acme.com", eventsRegistered: 2, lastAttended: "2026-02-10", status: "confirmed" },
  { id: "a3", name: "Sam Patel", email: "sam.p@acme.com", eventsRegistered: 1, lastAttended: null, status: "pending" },
  { id: "a4", name: "Taylor Kim", email: "taylor.k@acme.com", eventsRegistered: 4, lastAttended: "2026-03-01", status: "confirmed" },
  { id: "a5", name: "Morgan Lee", email: "morgan@acme.com", eventsRegistered: 1, lastAttended: null, status: "cancelled" },
];

const TAG_OPTIONS = ["Workshop", "Conference", "Training", "Keynote"];

// --- Component ---
const CorporateEvents = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CorporateEvent[]>(MOCK_EVENTS);
  const [attendees, setAttendees] = useState<Attendee[]>(MOCK_ATTENDEES);
  const [activeTab, setActiveTab] = useState("overview");

  // Create Event form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formTime, setFormTime] = useState("09:00");
  const [formDuration, setFormDuration] = useState("60");
  const [formFormat, setFormFormat] = useState<CorporateEvent["format"]>("in-person");
  const [formLocation, setFormLocation] = useState("");
  const [formMaxAttendees, setFormMaxAttendees] = useState("50");
  const [formTags, setFormTags] = useState<string[]>([]);

  // Attendee dialog
  const [addAttendeeOpen, setAddAttendeeOpen] = useState(false);
  const [newAttendeeName, setNewAttendeeName] = useState("");
  const [newAttendeeEmail, setNewAttendeeEmail] = useState("");

  // Schedule filter
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [attendeeSearch, setAttendeeSearch] = useState("");

  // Activity feed
  const recentActivity = [
    "New registration for Q2 Leadership Summit",
    "Product Design Workshop reached 90% capacity",
    "New Hire Onboarding draft created",
    "Sales Kickoff 2026 completed successfully",
    "Taylor Kim registered for 2 upcoming events",
  ];

  // --- Handlers ---
  const resetForm = () => {
    setFormTitle(""); setFormDesc(""); setFormDate(undefined); setFormTime("09:00");
    setFormDuration("60"); setFormFormat("in-person"); setFormLocation("");
    setFormMaxAttendees("50"); setFormTags([]);
  };

  const handleCreateEvent = (status: CorporateEvent["status"]) => {
    if (!formTitle || !formDate) {
      toast.error("Please fill in at least the title and date.");
      return;
    }
    const dateStr = `${format(formDate, "yyyy-MM-dd")}T${formTime}:00`;
    const newEvent: CorporateEvent = {
      id: crypto.randomUUID(),
      title: formTitle,
      description: formDesc,
      date: dateStr,
      duration: parseInt(formDuration) || 60,
      format: formFormat,
      location: formLocation,
      maxAttendees: parseInt(formMaxAttendees) || 50,
      registeredCount: 0,
      status,
      tags: formTags,
    };
    setEvents((prev) => [newEvent, ...prev]);
    resetForm();
    toast.success(status === "draft" ? "Event saved as draft." : "Event published!");
    setActiveTab("overview");
  };

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted.");
  };

  const handleAddAttendee = () => {
    if (!newAttendeeName || !newAttendeeEmail) { toast.error("Name and email required."); return; }
    setAttendees((prev) => [...prev, {
      id: crypto.randomUUID(), name: newAttendeeName, email: newAttendeeEmail,
      eventsRegistered: 0, lastAttended: null, status: "pending",
    }]);
    setNewAttendeeName(""); setNewAttendeeEmail("");
    setAddAttendeeOpen(false);
    toast.success("Attendee added.");
  };

  const handleExportCSV = () => {
    const header = "Name,Email,Events Registered,Last Attended,Status\n";
    const rows = attendees.map((a) => `${a.name},${a.email},${a.eventsRegistered},${a.lastAttended || "—"},${a.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "attendees.csv"; link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const toggleTag = (tag: string) => {
    setFormTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  // --- Derived ---
  const upcomingEvents = events.filter((e) => e.status !== "completed");
  const totalAttendees = attendees.length;
  const avgAttendance = events.length
    ? Math.round(events.reduce((s, e) => s + (e.maxAttendees > 0 ? (e.registeredCount / e.maxAttendees) * 100 : 0), 0) / events.length)
    : 0;

  const filteredScheduleEvents = upcomingEvents.filter((e) => {
    if (scheduleFilter === "week") return isThisWeek(parseISO(e.date));
    if (scheduleFilter === "month") return isThisMonth(parseISO(e.date));
    return true;
  });

  const filteredAttendees = attendees.filter((a) =>
    a.name.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    a.email.toLowerCase().includes(attendeeSearch.toLowerCase())
  );

  const formatBadgeVariant = (f: CorporateEvent["format"]) =>
    f === "virtual" ? "secondary" : f === "hybrid" ? "outline" : "default";

  const statusBadgeVariant = (s: CorporateEvent["status"]) =>
    s === "completed" ? "secondary" : s === "live" ? "destructive" : s === "published" ? "default" : "outline";

  const attendeeStatusVariant = (s: Attendee["status"]) =>
    s === "confirmed" ? "default" : s === "pending" ? "outline" : "secondary";

  // --- Sidebar items ---
  const sidebarItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "create", label: "Create Event", icon: Plus },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "attendees", label: "Attendees", icon: Users },
    { id: "checkins", label: "Live Check-Ins", icon: Radio },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <img src={edvanaLogo} alt="Edvana" className="h-8" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex min-h-[calc(100vh-57px)]">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card/50 py-6 px-3 gap-1">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left w-full",
                activeTab === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </aside>

        {/* Mobile Tabs */}
        <div className="md:hidden w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full rounded-none border-b border-border bg-card justify-start overflow-x-auto">
              {sidebarItems.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="gap-1.5 text-xs">
                  <item.icon className="w-3.5 h-3.5" /> {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 overflow-auto">

          {/* ===== OVERVIEW ===== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-foreground">Events Overview</h1>

              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Events", value: events.length, icon: CalendarDays },
                  { label: "Upcoming", value: upcomingEvents.length, icon: Clock },
                  { label: "Total Attendees", value: totalAttendees, icon: Users },
                  { label: "Avg Attendance", value: `${avgAttendance}%`, icon: BarChart3 },
                ].map((m) => (
                  <Card key={m.label}>
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="rounded-lg bg-primary/10 p-2.5">
                        <m.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{m.value}</p>
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Upcoming Events Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Upcoming Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="hidden sm:table-cell">Format</TableHead>
                        <TableHead className="hidden md:table-cell">Attendees</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">{ev.title}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(parseISO(ev.date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={formatBadgeVariant(ev.format)} className="capitalize">{ev.format}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {ev.registeredCount}/{ev.maxAttendees}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(ev.status)} className="capitalize">{ev.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setActiveTab("create"); /* could pre-fill for edit */ }}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEvent(ev.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {recentActivity.map((a, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                        <span className="text-muted-foreground">{a}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== CREATE EVENT ===== */}
          {activeTab === "create" && (
            <div className="max-w-2xl space-y-6">
              <h1 className="text-2xl font-bold text-foreground">Create Event</h1>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="ev-title">Event Title</Label>
                    <Input id="ev-title" placeholder="e.g. Q3 Strategy Workshop" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ev-desc">Description</Label>
                    <Textarea id="ev-desc" placeholder="Describe the event…" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formDate ? format(formDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={formDate} onSelect={setFormDate} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ev-time">Time</Label>
                      <Input id="ev-time" type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ev-duration">Duration (minutes)</Label>
                      <Input id="ev-duration" type="number" min="15" value={formDuration} onChange={(e) => setFormDuration(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Format</Label>
                      <Select value={formFormat} onValueChange={(v) => setFormFormat(v as CorporateEvent["format"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in-person">In-Person</SelectItem>
                          <SelectItem value="virtual">Virtual</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ev-loc">Location / Link</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="ev-loc" className="pl-9" placeholder="Room or URL" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ev-max">Max Attendees</Label>
                      <Input id="ev-max" type="number" min="1" value={formMaxAttendees} onChange={(e) => setFormMaxAttendees(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      {TAG_OPTIONS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                            formTags.includes(tag)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                          )}
                        >
                          <Tag className="w-3 h-3" /> {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => handleCreateEvent("draft")}>Save as Draft</Button>
                    <Button onClick={() => handleCreateEvent("published")}>Publish Event</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== SCHEDULE ===== */}
          {activeTab === "schedule" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
                <div className="flex gap-2">
                  {[{ label: "All", value: "all" }, { label: "This Week", value: "week" }, { label: "This Month", value: "month" }].map((f) => (
                    <Button key={f.value} size="sm" variant={scheduleFilter === f.value ? "default" : "outline"} onClick={() => setScheduleFilter(f.value)}>
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>

              {filteredScheduleEvents.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No events match this filter.</CardContent></Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredScheduleEvents.map((ev) => (
                    <Card key={ev.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground">{ev.title}</h3>
                          <Badge variant={statusBadgeVariant(ev.status)} className="capitalize shrink-0">{ev.status}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> {format(parseISO(ev.date), "MMM d, yyyy 'at' h:mm a")}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {ev.duration} min</span>
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {ev.registeredCount}/{ev.maxAttendees}</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={formatBadgeVariant(ev.format)} className="capitalize">{ev.format}</Badge>
                          {ev.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== ATTENDEES ===== */}
          {activeTab === "attendees" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-foreground">Attendees</h1>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
                    <Download className="w-4 h-4" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Reminders sent (placeholder).")}>
                    <Bell className="w-4 h-4" /> Send Reminder
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => setAddAttendeeOpen(true)}>
                    <UserPlus className="w-4 h-4" /> Add Attendee
                  </Button>
                </div>
              </div>

              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by name or email…" className="pl-9" value={attendeeSearch} onChange={(e) => setAttendeeSearch(e.target.value)} />
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Email</TableHead>
                        <TableHead className="hidden md:table-cell">Events</TableHead>
                        <TableHead className="hidden md:table-cell">Last Attended</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAttendees.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{a.email}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{a.eventsRegistered}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{a.lastAttended ? format(parseISO(a.lastAttended), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell><Badge variant={attendeeStatusVariant(a.status)} className="capitalize">{a.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {filteredAttendees.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No attendees found.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Add Attendee Dialog */}
              <Dialog open={addAttendeeOpen} onOpenChange={setAddAttendeeOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Attendee</DialogTitle>
                    <DialogDescription>Enter the attendee's name and email address.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="att-name">Name</Label>
                      <Input id="att-name" value={newAttendeeName} onChange={(e) => setNewAttendeeName(e.target.value)} placeholder="Full name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="att-email">Email</Label>
                      <Input id="att-email" type="email" value={newAttendeeEmail} onChange={(e) => setNewAttendeeEmail(e.target.value)} placeholder="email@company.com" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddAttendeeOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddAttendee}>Add</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ===== LIVE CHECK-INS ===== */}
          {activeTab === "checkins" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-foreground">Live Check-Ins</h1>
              <Card className="max-w-lg mx-auto">
                <CardContent className="py-16 text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
                    <Radio className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Real-Time Understanding Checks</CardTitle>
                  <CardDescription className="max-w-sm mx-auto">
                    Run live polls, quizzes, and understanding checks during your corporate events — powered by Edvana's AI engine. Coming soon.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CorporateEvents;
