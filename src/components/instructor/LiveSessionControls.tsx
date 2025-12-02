import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Play, Square, Copy, QrCode, Monitor } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LiveSession {
  id: string;
  session_code: string;
  title: string;
  is_active: boolean;
  created_at: string;
}

interface LiveSessionControlsProps {
  onSessionChange: (sessionId: string | null) => void;
}

export const LiveSessionControls = ({ onSessionChange }: LiveSessionControlsProps) => {
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    loadActiveSession();
    
    // Poll participant count every 5 seconds when session is active
    const interval = setInterval(() => {
      if (activeSession) {
        updateParticipantCount();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const loadActiveSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("instructor_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setActiveSession(data);
      onSessionChange(data.id);
      updateParticipantCount();
    }
  };

  const updateParticipantCount = async () => {
    if (!activeSession) return;

    const { count } = await supabase
      .from("live_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", activeSession.id);

    setParticipantCount(count || 0);
  };

  const handleStartSession = async () => {
    if (!sessionTitle.trim()) {
      toast.error("Please enter a session title");
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-live-session", {
        body: { title: sessionTitle.trim() },
      });

      if (error) throw error;

      setActiveSession(data.session);
      onSessionChange(data.session.id);
      setSessionTitle("");
      toast.success(`Session started! Code: ${data.session.session_code}`);
      setShowQR(true);
    } catch (error: any) {
      console.error("Error creating session:", error);
      toast.error("Failed to start session");
    } finally {
      setIsCreating(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;

    const { error } = await supabase
      .from("live_sessions")
      .update({ is_active: false })
      .eq("id", activeSession.id);

    if (error) {
      toast.error("Failed to end session");
      return;
    }

    setActiveSession(null);
    onSessionChange(null);
    toast.success("Session ended");
  };

  const copyJoinLink = () => {
    if (!activeSession) return;
    const link = `${window.location.origin}/join`;
    navigator.clipboard.writeText(link);
    toast.success("Join link copied!");
  };

  const openPresenterView = () => {
    if (!activeSession) return;
    window.open(
      `/instructor/presenter?session=${activeSession.session_code}`,
      'presenter-view',
      'width=450,height=800,menubar=no,toolbar=no,location=no,status=no'
    );
    toast.success("Presenter view opened!");
  };

  const joinUrl = `${window.location.origin}/join`;

  if (activeSession) {
    return (
      <>
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Badge variant="default" className="animate-pulse">LIVE</Badge>
                {activeSession.title}
              </span>
              <Button variant="destructive" size="sm" onClick={handleEndSession}>
                <Square className="mr-2 h-4 w-4" />
                End Session
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Session Code</p>
                <p className="text-3xl font-mono font-bold">{activeSession.session_code}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={openPresenterView}>
                  <Monitor className="mr-2 h-4 w-4" />
                  Presenter View
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowQR(true)}>
                  <QrCode className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={copyJoinLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{participantCount} participant{participantCount !== 1 ? 's' : ''} joined</span>
            </div>

            <p className="text-sm text-muted-foreground">
              Students can join at: <span className="font-mono">{joinUrl}</span>
            </p>
          </CardContent>
        </Card>

        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Join Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-center">
              <div className="p-8 bg-white rounded-lg inline-block">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${joinUrl}`}
                  alt="QR Code"
                  className="w-64 h-64"
                />
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-lg">Session Code</p>
                <p className="text-4xl font-mono font-bold">{activeSession.session_code}</p>
              </div>
              <p className="text-sm text-muted-foreground">{joinUrl}</p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start Live Session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Session title (e.g., 'Lecture 5 - Data Structures')"
          value={sessionTitle}
          onChange={(e) => setSessionTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
        />
        <Button 
          onClick={handleStartSession} 
          className="w-full"
          disabled={isCreating || !sessionTitle.trim()}
        >
          <Play className="mr-2 h-4 w-4" />
          Start Live Session
        </Button>
        <p className="text-xs text-muted-foreground">
          Students can join anonymously with just a nickname - no account required
        </p>
      </CardContent>
    </Card>
  );
};