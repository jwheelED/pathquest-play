import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Radio, Presentation, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface SessionReadyModuleProps {
  activeSession: Record<string, unknown> | null;
  onStartLive: () => void;
  onPresentSlides: () => void;
}

export function SessionReadyModule({ activeSession, onStartLive, onPresentSlides }: SessionReadyModuleProps) {
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
      <Card className="headspace-card">
        <CardContent className="p-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedCourse.course_code);
    setCodeCopied(true);
    toast.success("Join code copied ✓");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const isLive = !!activeSession;

  return (
    <Card className="headspace-card border-border/50 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 lg:p-6">
          {/* Left: Course info + join code */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {selectedCourse.title}
              </h2>
              {isLive && (
                <Badge variant="destructive" className="animate-pulse gap-1.5 shrink-0">
                  <span className="w-2 h-2 bg-destructive-foreground rounded-full" />
                  LIVE
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              <code className="text-xl font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-lg tracking-wider">
                {selectedCourse.course_code}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
              >
                {codeCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                <span className="ml-1 text-xs">{codeCopied ? "Copied" : "Copy"}</span>
              </Button>
              {studentCount !== null && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  {studentCount} participant{studentCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Right: CTAs */}
          <div className="flex items-center gap-3 shrink-0">
            <Button onClick={onStartLive} className="rounded-xl gap-2">
              <Radio className="w-4 h-4" />
              {isLive ? "Go to Live Session" : "Start Live"}
            </Button>
            <Button variant="outline" onClick={onPresentSlides} className="rounded-xl gap-2">
              <Presentation className="w-4 h-4" />
              Present Slides
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
