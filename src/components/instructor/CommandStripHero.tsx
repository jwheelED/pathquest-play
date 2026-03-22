import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Radio, Presentation, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CommandStripHeroProps {
  activeSession: Record<string, unknown> | null;
  onStartLive: () => void;
  onPresentSlides: () => void;
}

export function CommandStripHero({ activeSession, onStartLive, onPresentSlides }: CommandStripHeroProps) {
  const { selectedCourse, selectedCourseId } = useCourseContext();
  const [codeCopied, setCodeCopied] = useState(false);
  const [studentCount, setStudentCount] = useState<number | null>(null);

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

  if (!selectedCourse) {
    return (
      <div className="command-hero p-8">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedCourse.course_code);
    setCodeCopied(true);
    toast.success("Join code copied");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const isLive = !!activeSession;

  return (
    <div className="command-hero overflow-hidden">
      <div className="p-6 lg:p-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-3 mb-4">
          <span className="section-eyebrow">Current Session</span>
          {isLive && (
            <span className="live-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              LIVE
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl lg:text-3xl font-semibold text-charcoal tracking-tight mb-3">
          {selectedCourse.title}
        </h1>

        {/* Supporting metadata */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-charcoal-muted mb-5">
          <div className="flex items-center gap-2">
            <span className="text-charcoal-subtle">Join code:</span>
            <code className="font-semibold text-charcoal bg-slate-50 px-2 py-0.5 rounded text-base tracking-wider border border-slate-100">
              {selectedCourse.course_code}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-charcoal-muted hover:text-charcoal transition-colors"
            >
              {codeCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="sr-only md:not-sr-only">{codeCopied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          {studentCount !== null && (
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-charcoal-subtle" />
              <span>{studentCount} participant{studentCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Support line */}
        <p className="text-sm text-charcoal-subtle mb-6 max-w-xl">
          {isLive 
            ? "Your session is live. Students can join and respond to check-ins in real time."
            : "Your session is ready. Start live understanding when you are."
          }
        </p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            onClick={onStartLive} 
            className={cn(
              "rounded-full px-6 h-11 gap-2 font-medium shadow-sm",
              "bg-emerald-600 hover:bg-emerald-700 text-white",
              "transition-all duration-200 hover:shadow-md"
            )}
          >
            <Radio className="w-4 h-4" />
            {isLive ? "Go to Live Session" : "Start Live Session"}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={onPresentSlides} 
            className={cn(
              "rounded-full px-5 h-11 gap-2 font-medium",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300",
              "transition-all duration-200"
            )}
          >
            <Presentation className="w-4 h-4" />
            Present Slides
          </Button>
        </div>
      </div>
    </div>
  );
}
