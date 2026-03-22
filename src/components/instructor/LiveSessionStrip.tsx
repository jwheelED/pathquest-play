import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Monitor, Presentation, Users, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface LiveSession {
  id: string;
  session_code: string;
  title: string;
  is_active: boolean;
}

interface LiveSessionStripProps {
  activeSession: LiveSession | null;
  participantCount: number;
}

export function LiveSessionStrip({ activeSession, participantCount }: LiveSessionStripProps) {
  const navigate = useNavigate();
  const { selectedCourse } = useCourseContext();
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = () => {
    const code = activeSession?.session_code || selectedCourse?.course_code || "";
    if (code) {
      navigator.clipboard.writeText(code);
      setCodeCopied(true);
      toast.success("Join code copied");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const sessionTitle = activeSession?.title || selectedCourse?.title || "Live Session";
  const joinCode = activeSession?.session_code || selectedCourse?.course_code || "------";
  const isLive = !!activeSession?.is_active;

  return (
    <div className="command-card p-4 lg:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Session info */}
        <div className="flex-1 min-w-0">
          {/* Eyebrow + Status */}
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle">
              Current Session
            </span>
            {isLive && (
              <span className="live-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                LIVE
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-charcoal truncate mb-2">
            {sessionTitle}
          </h2>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-charcoal-subtle text-xs">Join code</span>
              <code className="font-semibold text-charcoal bg-slate-50 px-2 py-0.5 rounded text-sm tracking-widest border border-slate-100">
                {joinCode}
              </code>
            </div>
            <div className="flex items-center gap-1.5 text-charcoal-muted">
              <Users className="w-3.5 h-3.5 text-charcoal-subtle" />
              <span>{participantCount} participant{participantCount !== 1 ? "s" : ""} joined</span>
            </div>
          </div>

          {/* Support line */}
          <p className="text-xs text-charcoal-subtle mt-2 flex items-center gap-1.5">
            <ExternalLink className="w-3 h-3" />
            Students can join at <span className="font-medium text-charcoal-muted">edvana.dev/join</span>
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            className={cn(
              "rounded-full h-9 px-4 gap-2 text-sm font-medium",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            {codeCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Copy Join Code
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/instructor/presenter")}
            className={cn(
              "rounded-full h-9 px-4 gap-2 text-sm font-medium",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <Monitor className="w-3.5 h-3.5" />
            Presenter View
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/instructor/slides")}
            className={cn(
              "rounded-full h-9 px-4 gap-2 text-sm font-medium",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <Presentation className="w-3.5 h-3.5" />
            Present Slides
          </Button>
        </div>
      </div>
    </div>
  );
}
