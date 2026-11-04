import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Radio, Presentation, Users, Square, QrCode, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trackSessionStarted, trackSessionEnded } from "@/lib/posthogTracking";

interface CommandStripHeroProps {
  activeSession: Record<string, unknown> | null;
  onStartLive: () => void;
  onPresentSlides: () => void;
  onSessionChange?: (sessionId: string | null) => void;
  setActiveSession?: (session: Record<string, unknown> | null) => void;
}

export function CommandStripHero({ activeSession, onStartLive, onPresentSlides, onSessionChange, setActiveSession }: CommandStripHeroProps) {
  const { selectedCourse, selectedCourseId } = useCourseContext();
  const [codeCopied, setCodeCopied] = useState(false);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    if (!selectedCourseId) return;
    const fetchCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("instructor_students")
        .select("id", { count: "exact", head: true })
        .eq("instructor_id", user.id)
        .or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      setStudentCount(count ?? 0);
    };
    fetchCount();
  }, [selectedCourseId]);

  // Poll participant count when session is active
  useEffect(() => {
    if (!activeSession?.id) {
      setParticipantCount(0);
      return;
    }
    const sessionId = activeSession.id as string;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("live_participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);
      setParticipantCount(count || 0);
    };
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => clearInterval(interval);
  }, [activeSession?.id]);

  if (!selectedCourse) {
    return (
      <div className="command-hero p-8">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleStartSession = async () => {
    if (!sessionTitle.trim() || !selectedCourseId) {
      toast.error(!sessionTitle.trim() ? "Enter a session title" : "Select a course first");
      return;
    }
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-live-session", {
        body: { title: sessionTitle.trim(), courseId: selectedCourseId },
      });
      if (error) throw error;
      setActiveSession?.(data.session);
      onSessionChange?.(data.session.id);
      setSessionTitle("");
      trackSessionStarted(data.session.session_code, selectedCourseId);
      toast.success(`Session started! Code: ${data.session.session_code}`);
      setShowQR(true);
    } catch (err: unknown) {
      console.error("Error creating session:", err);
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
      .eq("id", activeSession.id as string);
    if (error) {
      toast.error("Failed to end session");
      return;
    }
    trackSessionEnded(activeSession.session_code as string, participantCount);
    setActiveSession?.(null);
    onSessionChange?.(null);
    toast.success("Session ended");
  };

  const isLive = !!activeSession;
  const sessionCode = activeSession?.session_code as string;
  const origin = window.location.hostname === "localhost" ? "http://localhost:8080" : "https://edvana.dev";
  const joinUrl = `${origin}/join`;

  return (
    <>
      <div className="command-hero overflow-hidden">
        <div className="p-6 lg:p-8">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-3">
            <span className="section-eyebrow">{isLive ? "Live Session" : "Current Session"}</span>
            {isLive && (
              <span className="live-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl lg:text-[1.75rem] font-semibold text-charcoal tracking-tight mb-4">
            {isLive ? (activeSession.title as string) : selectedCourse.title}
          </h1>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-charcoal-muted mb-4">
            {isLive ? (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="text-charcoal-subtle text-xs uppercase tracking-wide font-medium">Session code</span>
                  <code className="font-semibold text-charcoal bg-slate-50 px-2.5 py-1 rounded-lg text-lg tracking-widest border border-slate-100">
                    {sessionCode}
                  </code>
                  <button
                    onClick={() => handleCopy(sessionCode)}
                    className="inline-flex items-center gap-1 text-xs text-charcoal-muted hover:text-charcoal transition-colors p-1 -m-1 rounded"
                  >
                    {codeCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setShowQR(true)}
                    className="inline-flex items-center gap-1 text-xs text-charcoal-muted hover:text-charcoal transition-colors p-1 -m-1 rounded"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-charcoal-muted">
                  <Users className="w-4 h-4 text-charcoal-subtle" />
                  <span>{participantCount} participant{participantCount !== 1 ? "s" : ""} joined</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="text-charcoal-subtle text-xs uppercase tracking-wide font-medium">Join code</span>
                  <code className="font-semibold text-charcoal bg-slate-50 px-2.5 py-1 rounded-lg text-base tracking-widest border border-slate-100">
                    {selectedCourse.course_code}
                  </code>
                  <button
                    onClick={() => handleCopy(selectedCourse.course_code)}
                    className="inline-flex items-center gap-1 text-xs text-charcoal-muted hover:text-charcoal transition-colors p-1 -m-1 rounded"
                  >
                    {codeCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {studentCount !== null && (
                  <div className="flex items-center gap-1.5 text-charcoal-muted">
                    <Users className="w-4 h-4 text-charcoal-subtle" />
                    <span>{studentCount} student{studentCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Support line */}
          {isLive && (
            <p className="text-sm text-charcoal-subtle mb-4 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Students join at <span className="font-medium">edvana.dev/join</span> with code <span className="font-mono font-semibold">{sessionCode}</span>
            </p>
          )}

          {/* Start session input (when not live) */}
          {!isLive && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Input
                placeholder="Session title (e.g., 'Lecture 5 - Data Structures')"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
                className="max-w-sm h-11 rounded-full px-5 border-slate-200 focus:border-emerald-300 focus:ring-emerald-200 text-sm"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {isLive ? (
              <>
                <Button
                  onClick={onStartLive}
                  className={cn(
                    "rounded-full px-6 h-11 gap-2.5 font-medium shadow-sm",
                    "bg-emerald-600 hover:bg-emerald-700 text-white",
                    "transition-all duration-200 hover:shadow-md"
                  )}
                >
                  <Radio className="w-4 h-4" />
                  Go to Live Copilot
                </Button>
                <Button
                  variant="outline"
                  onClick={onPresentSlides}
                  className={cn(
                    "rounded-full px-5 h-11 gap-2 font-medium",
                    "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
                  )}
                >
                  <Presentation className="w-4 h-4" />
                  Present Slides
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEndSession}
                  className={cn(
                    "rounded-full px-5 h-11 gap-2 font-medium",
                    "border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  )}
                >
                  <Square className="w-4 h-4" />
                  End Session
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleStartSession}
                  disabled={isCreating || !sessionTitle.trim()}
                  className={cn(
                    "rounded-full px-6 h-11 gap-2.5 font-medium shadow-sm",
                    "bg-emerald-600 hover:bg-emerald-700 text-white",
                    "transition-all duration-200 hover:shadow-md"
                  )}
                >
                  <Radio className="w-4 h-4" />
                  {isCreating ? "Starting..." : "Start Live Session"}
                </Button>
                <Button
                  variant="outline"
                  onClick={onPresentSlides}
                  className={cn(
                    "rounded-full px-5 h-11 gap-2 font-medium",
                    "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
                  )}
                >
                  <Presentation className="w-4 h-4" />
                  Present Slides
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* QR Code + Session Info Dialog */}
      {isLive && (
        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">🎓 Live Session Active</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 text-center py-4">
              {/* Session Code */}
              <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-sm text-charcoal-muted mb-2">Students enter this code:</p>
                <div className="flex items-center justify-center gap-3">
                  <p className="text-5xl font-mono font-bold tracking-widest text-emerald-700">
                    {sessionCode}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(sessionCode)}
                    className="rounded-lg"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* QR Code */}
              <div>
                <p className="text-sm text-charcoal-muted mb-3">Or scan to join:</p>
                <div className="p-4 bg-white rounded-lg inline-block shadow-md border">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${joinUrl}?code=${sessionCode}`}
                    alt="QR Code to join session"
                    className="w-48 h-48"
                  />
                </div>
              </div>

              {/* Join URL */}
              <div className="flex items-center justify-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm font-mono truncate">{joinUrl}</span>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(joinUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-charcoal-subtle">
                Students can join from the landing page or directly at edvana.dev/join
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
