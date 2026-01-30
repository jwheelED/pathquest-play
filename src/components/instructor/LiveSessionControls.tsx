import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Play, Square, Copy, QrCode, Monitor } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCourseContext } from "@/hooks/useCourseContext";

interface LiveSession {
  id: string;
  session_code: string;
  title: string;
  is_active: boolean;
  created_at: string;
}

interface LiveSessionControlsProps {
  onSessionChange: (sessionId: string | null) => void;
  activeSession: LiveSession | null;
  setActiveSession: (session: LiveSession | null) => void;
}

export const LiveSessionControls = ({ 
  onSessionChange, 
  activeSession, 
  setActiveSession 
}: LiveSessionControlsProps) => {
  const [sessionTitle, setSessionTitle] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const { selectedCourseId } = useCourseContext();
  
  // Ref to prevent re-querying immediately after session creation
  const justCreatedSessionRef = useRef(false);

  useEffect(() => {
    // Skip if we just created a session - don't re-query which could clear state
    if (justCreatedSessionRef.current) {
      justCreatedSessionRef.current = false;
      return;
    }
    
    loadActiveSession();
  }, [selectedCourseId]);

  // Separate effect for polling participant count
  useEffect(() => {
    if (!activeSession) return;
    
    // Initial count update
    updateParticipantCount();
    
    // Poll participant count every 5 seconds when session is active
    const interval = setInterval(() => {
      updateParticipantCount();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeSession?.id]);

  const loadActiveSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !selectedCourseId) return;

    const { data } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("instructor_id", user.id)
      .eq("course_id", selectedCourseId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setActiveSession(data);
      onSessionChange(data.id);
      updateParticipantCount();
    } else {
      setActiveSession(null);
      onSessionChange(null);
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
    
    if (!selectedCourseId) {
      toast.error("Please select a course first");
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-live-session", {
        body: { title: sessionTitle.trim(), courseId: selectedCourseId },
      });

      if (error) throw error;

      // Set flag to prevent useEffect from re-querying and clearing state
      justCreatedSessionRef.current = true;
      setActiveSession(data.session);
      onSessionChange(data.session.id);
      setSessionTitle("");
      
      // Play audio notification for session start
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        // Audio not critical
      }
      
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

  // Use production domain for QR codes to avoid preview URL issues
  const origin = window.location.hostname === "localhost" 
    ? "http://localhost:8080" 
    : "https://edvana.dev";
  const joinUrl = `${origin}/join`;

  if (activeSession) {
    return (
      <>
        <Card className="border-primary overflow-hidden">
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
            <div className="flex flex-col gap-4 p-4 bg-primary/5 rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Session Code</p>
                  <p className="text-3xl font-mono font-bold">{activeSession.session_code}</p>
                </div>
                <div className="flex flex-wrap gap-2">
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
            </div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>{participantCount} participant{participantCount !== 1 ? 's' : ''} joined</span>
            </div>

            <p className="text-sm text-muted-foreground break-all">
              Students can join at: <span className="font-mono">{joinUrl}</span>
            </p>
          </CardContent>
        </Card>

        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">🎓 Live Session Started!</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 text-center py-4">
              {/* Prominent Session Code */}
              <div className="p-6 bg-primary/10 rounded-xl border-2 border-primary/30">
                <p className="text-sm text-muted-foreground mb-2">Students enter this code:</p>
                <div className="flex items-center justify-center gap-3">
                  <p className="text-5xl font-mono font-bold tracking-widest text-primary">
                    {activeSession.session_code}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(activeSession.session_code);
                      toast.success("Code copied!");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* QR Code */}
              <div>
                <p className="text-sm text-muted-foreground mb-3">Or scan to join:</p>
                <div className="p-4 bg-white rounded-lg inline-block shadow-md">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${joinUrl}`}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                </div>
              </div>

              {/* Join URL */}
              <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
                <span className="text-sm font-mono truncate">{joinUrl}</span>
                <Button variant="ghost" size="sm" onClick={copyJoinLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Keep this window visible or use the Presenter View button for easy access
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="overflow-hidden">
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