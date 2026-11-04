import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, ArrowRight, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { logger } from "@/lib/logger";

interface PendingAssignment {
  id: string;
  title: string;
  assignment_type: string;
  created_at: string;
  course_id: string | null;
  instructor_id: string | null;
}

interface CourseInfo {
  id: string;
  name: string;
}

interface Props {
  userId: string;
}

/**
 * Surfaces sent questions (student_assignments) on the main student dashboard
 * so participants don't have to dig into a class to find them.
 */
export function PendingInstructorQuestions({ userId }: Props) {
  const [pending, setPending] = useState<PendingAssignment[]>([]);
  const [courses, setCourses] = useState<Record<string, CourseInfo>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    fetchPending();

    // Realtime: notify when a new question arrives so students know to look here
    const channel = supabase
      .channel(`pending-questions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_assignments",
          filter: `student_id=eq.${userId}`,
        },
        (payload) => {
          const a = payload.new as PendingAssignment;
          sonnerToast.success("New question from your instructor", {
            description: a.title || "Open it on your class dashboard",
            action: a.instructor_id
              ? {
                  label: "Open",
                  onClick: () =>
                    navigate(
                      `/class/${a.instructor_id}${a.course_id ? `?course=${a.course_id}` : ""}`
                    ),
                }
              : undefined,
          });
          fetchPending();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_assignments",
          filter: `student_id=eq.${userId}`,
        },
        () => fetchPending()
      )
      .subscribe();

    // Polling fallback every 20s
    const interval = setInterval(fetchPending, 20000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchPending = async () => {
    try {
      const { data, error } = await supabase
        .from("student_assignments")
        .select("id, title, assignment_type, created_at, course_id, instructor_id")
        .eq("student_id", userId)
        .eq("completed", false)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      const items = (data || []) as PendingAssignment[];
      setPending(items);

      const courseIds = [...new Set(items.map((i) => i.course_id).filter(Boolean))] as string[];
      if (courseIds.length) {
        const { data: courseData } = await supabase
          .from("courses")
          .select("id, name")
          .in("id", courseIds);
        const map: Record<string, CourseInfo> = {};
        (courseData || []).forEach((c: any) => {
          map[c.id] = { id: c.id, name: c.name };
        });
        setCourses(map);
      }
    } catch (err) {
      logger.error("Error fetching pending instructor questions:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  // Empty state — keep visible so students know WHERE questions appear
  if (pending.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-4 h-4 text-muted-foreground" />
            Questions from Your Instructor
          </CardTitle>
          <CardDescription>
            When your instructor sends a question, it will appear here and on your class dashboard.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-600" />
              Questions from Your Instructor
              <Badge className="bg-emerald-600 hover:bg-emerald-600">{pending.length} new</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Tap a question to open it in your class dashboard.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map((q) => {
          const course = q.course_id ? courses[q.course_id] : null;
          return (
            <button
              key={q.id}
              onClick={() => {
                if (q.instructor_id) {
                  navigate(
                    `/class/${q.instructor_id}${q.course_id ? `?course=${q.course_id}` : ""}`
                  );
                } else {
                  sonnerToast.info("Open your class to answer this question");
                }
              }}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-background border border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{q.title || "New question"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {course ? course.name : "Class"} ·{" "}
                  {new Date(q.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
        {pending.length > 0 && pending[0].instructor_id && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={() =>
              navigate(
                `/class/${pending[0].instructor_id}${pending[0].course_id ? `?course=${pending[0].course_id}` : ""}`
              )
            }
          >
            Open class dashboard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
