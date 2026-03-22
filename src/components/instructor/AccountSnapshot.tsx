import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, HelpCircle, FileText, Radio, Presentation, Library, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccountStats {
  totalParticipants: number;
  totalSessions: number;
  totalCheckIns: number;
  materialsUploaded: number;
}

interface AccountSnapshotProps {
  onNavigate: (tab: string) => void;
  onStartLive: () => void;
  onPresentSlides: () => void;
}

export function AccountSnapshot({ onNavigate, onStartLive, onPresentSlides }: AccountSnapshotProps) {
  const { selectedCourseId } = useCourseContext();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCourseId) {
      setLoading(false);
      return;
    }
    fetchStats();
  }, [selectedCourseId]);

  const fetchStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [studentsRes, sessionsRes, materialsRes] = await Promise.all([
        supabase
          .from("instructor_students")
          .select("id", { count: "exact", head: true })
          .eq("instructor_id", user.id)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
        supabase
          .from("live_sessions")
          .select("id")
          .eq("instructor_id", user.id)
          .eq("is_active", false)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
        supabase
          .from("lecture_materials")
          .select("id", { count: "exact", head: true })
          .eq("instructor_id", user.id)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
      ]);

      const sessionIds = (sessionsRes.data || []).map(s => s.id);
      let totalCheckIns = 0;

      if (sessionIds.length > 0) {
        const { count } = await supabase
          .from("live_questions")
          .select("id", { count: "exact", head: true })
          .in("session_id", sessionIds);
        totalCheckIns = count || 0;
      }

      setStats({
        totalParticipants: studentsRes.count || 0,
        totalSessions: sessionIds.length,
        totalCheckIns,
        materialsUploaded: materialsRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching account stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-10 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2 pb-4">
      {/* Account Snapshot */}
      <div className="space-y-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
          Account Snapshot
        </span>
        <h3 className="text-sm font-medium text-charcoal-muted -mt-1 mb-3">
          Your workspace at a glance
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-50/70 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="w-3 h-3 text-charcoal-subtle" />
              <span className="text-[10px] font-medium text-charcoal-subtle uppercase tracking-wide">Participants</span>
            </div>
            <p className="text-lg font-semibold text-charcoal">{stats?.totalParticipants ?? 0}</p>
          </div>
          
          <div className="bg-slate-50/70 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Calendar className="w-3 h-3 text-charcoal-subtle" />
              <span className="text-[10px] font-medium text-charcoal-subtle uppercase tracking-wide">Sessions</span>
            </div>
            <p className="text-lg font-semibold text-charcoal">{stats?.totalSessions ?? 0}</p>
          </div>
          
          <div className="bg-slate-50/70 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <HelpCircle className="w-3 h-3 text-charcoal-subtle" />
              <span className="text-[10px] font-medium text-charcoal-subtle uppercase tracking-wide">Check-ins</span>
            </div>
            <p className="text-lg font-semibold text-charcoal">{stats?.totalCheckIns ?? 0}</p>
          </div>
          
          <div className="bg-slate-50/70 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <FileText className="w-3 h-3 text-charcoal-subtle" />
              <span className="text-[10px] font-medium text-charcoal-subtle uppercase tracking-wide">Materials</span>
            </div>
            <p className="text-lg font-semibold text-charcoal">{stats?.materialsUploaded ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
          Quick Actions
        </span>
        
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onStartLive}
            className={cn(
              "rounded-full h-9 px-4 text-sm font-medium gap-2",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <Radio className="w-3.5 h-3.5" />
            Go Live
          </Button>
          
          <Button
            variant="outline"
            onClick={onPresentSlides}
            className={cn(
              "rounded-full h-9 px-4 text-sm font-medium gap-2",
              "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <Presentation className="w-3.5 h-3.5" />
            Present Slides
          </Button>
          
          <Button
            variant="outline"
            onClick={() => onNavigate("summaries")}
            className={cn(
              "rounded-full h-9 px-4 text-sm font-medium gap-2",
              "border-slate-200 text-charcoal-muted hover:bg-slate-50 hover:border-slate-300 hover:text-charcoal"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Review Last Summary
          </Button>
          
          <Button
            variant="outline"
            onClick={() => onNavigate("question-bank")}
            className={cn(
              "rounded-full h-9 px-4 text-sm font-medium gap-2",
              "border-slate-200 text-charcoal-muted hover:bg-slate-50 hover:border-slate-300 hover:text-charcoal"
            )}
          >
            <Library className="w-3.5 h-3.5" />
            Open Question Bank
          </Button>
        </div>
      </div>
    </div>
  );
}
