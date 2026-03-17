import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EdvanaIcon } from "@/components/ui/EdvanaIcon";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Square, Copy, QrCode, Users, Mic, BarChart3,
  Clock, CheckCircle, Radio, Settings, History, Zap, ChevronRight,
  Eye, TrendingUp,
} from "lucide-react";

// --- Types ---
interface MockSession {
  id: string;
  title: string;
  date: string;
  participants: number;
  questionsSent: number;
  avgScore: number;
  status: "completed" | "live";
  questions: { text: string; responses: number; correctPct: number }[];
}

interface SpeakerSettings {
  name: string;
  email: string;
  defaultFormat: string;
  audioAlerts: boolean;
  showQrOnStart: boolean;
}

// --- Mock Data ---
const MOCK_PAST_SESSIONS: MockSession[] = [
  {
    id: "1", title: "AI in Healthcare Keynote", date: "2026-03-08T14:00:00",
    participants: 342, questionsSent: 8, avgScore: 76, status: "completed",
    questions: [
      { text: "What is the primary benefit of AI in diagnostics?", responses: 298, correctPct: 82 },
      { text: "Which ML model is most used in radiology?", responses: 312, correctPct: 64 },
      { text: "What does HIPAA regulate?", responses: 305, correctPct: 91 },
    ],
  },
  {
    id: "2", title: "Future of Remote Work Panel", date: "2026-03-05T10:00:00",
    participants: 189, questionsSent: 5, avgScore: 81, status: "completed",
    questions: [
      { text: "What percentage of workers prefer hybrid?", responses: 167, correctPct: 73 },
      { text: "Which tool is most used for async communication?", responses: 172, correctPct: 88 },
    ],
  },
  {
    id: "3", title: "Startup Pitch Workshop", date: "2026-02-28T09:00:00",
    participants: 94, questionsSent: 12, avgScore: 68, status: "completed",
    questions: [
      { text: "What is a cap table?", responses: 88, correctPct: 72 },
      { text: "Which metric do VCs prioritize for SaaS?", responses: 91, correctPct: 59 },
    ],
  },
  {
    id: "4", title: "Data Privacy Compliance Talk", date: "2026-02-20T15:30:00",
    participants: 215, questionsSent: 6, avgScore: 74, status: "completed",
    questions: [
      { text: "What is GDPR's core principle?", responses: 198, correctPct: 85 },
    ],
  },
];

const generateSessionCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

// --- Component ---
export default function CorporateEvents() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  // Live session state
  const [sessionTitle, setSessionTitle] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [liveCode, setLiveCode] = useState("");
  const [liveParticipants, setLiveParticipants] = useState(0);
  const [showQR, setShowQR] = useState(false);

  // Past sessions
  const [detailSession, setDetailSession] = useState<MockSession | null>(null);

  // Settings
  const [settings, setSettings] = useState<SpeakerSettings>({
    name: "Alex Rivera",
    email: "alex@company.com",
    defaultFormat: "keynote",
    audioAlerts: true,
    showQrOnStart: true,
  });

  const origin = window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://edvana.dev";
  const joinUrl = `${origin}/join`;

  const handleGoLive = () => {
    if (!sessionTitle.trim()) {
      toast.error("Enter a session title to go live");
      return;
    }
    const code = generateSessionCode();
    setLiveCode(code);
    setIsLive(true);
    setLiveParticipants(0);
    setActiveTab("live");
    toast.success(`You're live! Session code: ${code}`);
    if (settings.showQrOnStart) setShowQR(true);

    // Simulate participants joining
    let count = 0;
    const interval = setInterval(() => {
      count += Math.floor(Math.random() * 8) + 1;
      if (count > 150) { clearInterval(interval); return; }
      setLiveParticipants(count);
    }, 2000);
  };

  const handleEndSession = () => {
    setIsLive(false);
    setLiveCode("");
    setSessionTitle("");
    setLiveParticipants(0);
    toast.success("Session ended");
  };

  const copyJoinLink = () => {
    navigator.clipboard.writeText(joinUrl);
    toast.success("Join link copied!");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(liveCode);
    toast.success("Code copied!");
  };

  // Metrics
  const totalSessions = MOCK_PAST_SESSIONS.length;
  const totalParticipants = MOCK_PAST_SESSIONS.reduce((s, e) => s + e.participants, 0);
  const avgEngagement = Math.round(MOCK_PAST_SESSIONS.reduce((s, e) => s + e.avgScore, 0) / totalSessions);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EdvanaIcon className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Speaker Dashboard</h1>
              <p className="text-xs text-muted-foreground">Corporate Events</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isLive && (
              <Badge variant="default" className="animate-pulse gap-1">
                <Radio className="w-3 h-3" /> LIVE
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Home
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 w-full md:w-auto">
            <TabsTrigger value="overview" className="gap-1.5"><Zap className="w-4 h-4" /> Overview</TabsTrigger>
            <TabsTrigger value="live" className="gap-1.5"><Radio className="w-4 h-4" /> Live Session</TabsTrigger>
            <TabsTrigger value="past" className="gap-1.5"><History className="w-4 h-4" /> Past Sessions</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-4 h-4" /> Settings</TabsTrigger>
          </TabsList>

          {/* ===== OVERVIEW ===== */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Start */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-primary" /> Quick Start
                </CardTitle>
                <CardDescription>Launch a live session — attendees join with a code on their phone</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Session title (e.g., 'Keynote — AI Ethics')"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isLive && handleGoLive()}
                    className="flex-1"
                  />
                  <Button onClick={handleGoLive} disabled={isLive || !sessionTitle.trim()} className="gap-2 shrink-0">
                    <Play className="w-4 h-4" /> Go Live
                  </Button>
                </div>
                {isLive && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    You're live! Switch to the <button className="text-primary underline" onClick={() => setActiveTab("live")}>Live Session</button> tab to manage.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><BarChart3 className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{totalSessions}</p>
                      <p className="text-xs text-muted-foreground">Total Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{totalParticipants.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Attendees</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{avgEngagement}%</p>
                      <p className="text-xs text-muted-foreground">Avg Engagement</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {MOCK_PAST_SESSIONS.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-medium text-foreground">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {s.participants} attendees · {s.questionsSent} questions
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setDetailSession(s); setActiveTab("past"); }}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== LIVE SESSION ===== */}
          <TabsContent value="live" className="space-y-6">
            {isLive ? (
              <>
                {/* Active Session Card */}
                <Card className="border-primary overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Badge variant="default" className="animate-pulse">LIVE</Badge>
                        {sessionTitle}
                      </span>
                      <Button variant="destructive" size="sm" onClick={handleEndSession}>
                        <Square className="mr-2 h-4 w-4" /> End Session
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-4 p-4 bg-primary/5 rounded-lg">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Session Code</p>
                          <p className="text-4xl font-mono font-bold tracking-widest text-foreground">{liveCode}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowQR(true)}><QrCode className="h-4 w-4" /></Button>
                          <Button variant="outline" size="sm" onClick={copyCode}><Copy className="mr-1 h-4 w-4" /> Code</Button>
                          <Button variant="outline" size="sm" onClick={copyJoinLink}><Copy className="mr-1 h-4 w-4" /> Link</Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{liveParticipants} attendee{liveParticipants !== 1 ? "s" : ""} joined</span>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Attendees join at: <span className="font-mono text-foreground">{joinUrl}</span>
                    </p>
                  </CardContent>
                </Card>

                {/* Live Capture */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mic className="w-5 h-5 text-primary" /> Live Capture
                    </CardTitle>
                    <CardDescription>Real-time transcription generates understanding checks for your audience</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/20">
                      <div className="relative">
                        <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                        <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Listening…</p>
                        <p className="text-xs text-muted-foreground">AI is transcribing your talk and will generate questions automatically</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Live Results */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="w-5 h-5 text-primary" /> Live Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <Users className="h-7 w-7 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Responses</p>
                          <p className="text-2xl font-bold text-foreground">0/{liveParticipants}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-7 w-7 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Correct</p>
                          <p className="text-2xl font-bold text-primary">—</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Clock className="h-7 w-7 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Time</p>
                          <p className="text-2xl font-bold text-foreground">—</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="text-center py-12">
                <CardContent className="space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Radio className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">No Active Session</h3>
                    <p className="text-sm text-muted-foreground mt-1">Start a live session from the Overview tab or enter a title below.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                    <Input
                      placeholder="Session title…"
                      value={sessionTitle}
                      onChange={(e) => setSessionTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGoLive()}
                      className="flex-1"
                    />
                    <Button onClick={handleGoLive} disabled={!sessionTitle.trim()} className="gap-2">
                      <Play className="w-4 h-4" /> Go Live
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ===== PAST SESSIONS ===== */}
          <TabsContent value="past" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Session History</CardTitle>
                <CardDescription>Review engagement data from your past talks</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                      <TableHead className="text-right">Attendees</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Questions</TableHead>
                      <TableHead className="text-right">Avg Score</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_PAST_SESSIONS.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.title}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-right">{s.participants}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell">{s.questionsSent}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.avgScore >= 75 ? "default" : "secondary"}>{s.avgScore}%</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setDetailSession(s)}>
                            <Eye className="w-4 h-4 mr-1" /> Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {detailSession && (
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{detailSession.title} — Question Breakdown</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setDetailSession(null)}>Close</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead className="text-right">Responses</TableHead>
                        <TableHead className="text-right">Correct</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailSession.questions.map((q, i) => (
                        <TableRow key={i}>
                          <TableCell>{q.text}</TableCell>
                          <TableCell className="text-right">{q.responses}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={q.correctPct >= 75 ? "default" : "secondary"}>{q.correctPct}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ===== SETTINGS ===== */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Speaker Profile</CardTitle>
                <CardDescription>Your information displayed during live sessions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Default Session Format</Label>
                  <Select value={settings.defaultFormat} onValueChange={(v) => setSettings({ ...settings, defaultFormat: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keynote">Keynote</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="panel">Panel Discussion</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Audio alerts for responses</Label>
                    <p className="text-xs text-muted-foreground">Play a sound when attendees respond</p>
                  </div>
                  <Switch checked={settings.audioAlerts} onCheckedChange={(v) => setSettings({ ...settings, audioAlerts: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show QR code on session start</Label>
                    <p className="text-xs text-muted-foreground">Automatically display join QR when you go live</p>
                  </div>
                  <Switch checked={settings.showQrOnStart} onCheckedChange={(v) => setSettings({ ...settings, showQrOnStart: v })} />
                </div>
                <Button onClick={() => toast.success("Settings saved")} className="mt-2">Save Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* QR Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">🎤 You're Live!</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-center py-4">
            <div className="p-6 bg-primary/10 rounded-xl border-2 border-primary/30">
              <p className="text-sm text-muted-foreground mb-2">Attendees enter this code:</p>
              <div className="flex items-center justify-center gap-3">
                <p className="text-5xl font-mono font-bold tracking-widest text-primary">{liveCode}</p>
                <Button variant="outline" size="sm" onClick={copyCode}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-3">Or scan to join:</p>
              <div className="p-4 bg-white rounded-lg inline-block shadow-md">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${joinUrl}`}
                  alt="QR Code to join session"
                  className="w-48 h-48"
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-sm font-mono truncate">{joinUrl}</span>
              <Button variant="ghost" size="sm" onClick={copyJoinLink}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
