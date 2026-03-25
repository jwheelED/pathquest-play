import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Monitor, Presentation, Users, ExternalLink } from "lucide-react";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
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
    <div className="command-card px-4 py-3 lg:px-5 lg:py-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        {/* Left: Session info */}
        <div className="flex-1 min-w-0">
          {/* Eyebrow + Status */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle">
              Current Session
            </span>
            {isLive && (
              <span className="live-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                LIVE
              </span>
            )}
          </div>

          {/* Title + metadata inline */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold text-charcoal truncate">
              {sessionTitle}
            </h2>
            <div className="flex items-center gap-3 text-xs text-charcoal-muted">
              <span className="flex items-center gap-1.5">
                <span className="text-charcoal-subtle">Code:</span>
                <code className="font-semibold text-charcoal bg-slate-50 px-1.5 py-0.5 rounded text-xs tracking-wider border border-slate-100">
                  {joinCode}
                </code>
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-charcoal-subtle" />
                {participantCount} joined
              </span>
            </div>
          </div>

          {/* Support line */}
          <p className="text-[11px] text-charcoal-subtle mt-1 flex items-center gap-1">
            <ExternalLink className="w-2.5 h-2.5" />
            Students join at <span className="font-medium">edvana.dev/join</span>
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            className={cn(
              "rounded-full h-8 px-3 gap-1.5 text-xs font-medium",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            {codeCopied ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            Copy Code
          </Button>

        </div>
      </div>
    </div>
  );
}
