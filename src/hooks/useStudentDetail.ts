import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseQuestionText } from "@/lib/misconceptions";
import { parseResponses, type ParsedResponse } from "@/lib/studentSignals";
import type { CourseVideo } from "@/hooks/useStudentRoster";

export interface ActivityItem {
  type: "video-started" | "video-completed" | "checkin-completed";
  description: string;
  date: string;
}

export interface QuestionResponse extends ParsedResponse {
  questionText: string;
}

export interface VideoResponseGroup {
  videoId: string;
  videoTitle: string;
  questionCount: number;
  completedAt: string | null;
  responses: QuestionResponse[];
}

export interface StudentDetailData {
  recentActivity: ActivityItem[];
  responsesByVideo: VideoResponseGroup[];
  totalResponses: number;
}

export function useStudentDetail(
  studentId: string | null,
  instructorId: string | null,
  courseId: string | null,
  courseVideos: CourseVideo[],
) {
  const videoIds = courseVideos.map(v => v.id);
  // Fingerprint the video list into the key: the roster query supplies it, so
  // a detail fetched against an empty/partial list must not be cached as final.
  const videosKey = [...videoIds].sort().join(",");

  return useQuery<StudentDetailData>({
    queryKey: ["student-detail", studentId, courseId, videosKey],
    enabled: !!studentId && !!instructorId && !!courseId,
    queryFn: async () => {
      if (!studentId || !instructorId || !courseId) {
        return { recentActivity: [], responsesByVideo: [], totalResponses: 0 };
      }

      const [progressRes, assignmentsRes] = await Promise.all([
        videoIds.length > 0
          ? supabase
              .from("student_lecture_progress")
              .select("lecture_video_id, responses, started_at, completed_at")
              .eq("student_id", studentId)
              .in("lecture_video_id", videoIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("student_assignments")
          .select("grade, completed, opened_at, created_at")
          .eq("assignment_type", "lecture_checkin")
          .eq("instructor_id", instructorId)
          .eq("course_id", courseId)
          .eq("student_id", studentId),
      ]);
      if (progressRes.error) throw progressRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const progress = progressRes.data || [];
      const assignments = assignmentsRes.data || [];

      // Question text for every pause point the student touched.
      const touchedVideoIds = [...new Set(progress.map(p => p.lecture_video_id))];
      const questionTextById = new Map<string, string>();
      if (touchedVideoIds.length > 0) {
        const { data: pausePoints, error } = await supabase
          .from("lecture_pause_points")
          .select("id, question_content")
          .in("lecture_video_id", touchedVideoIds);
        if (error) throw error;
        (pausePoints || []).forEach(pp => {
          questionTextById.set(pp.id, parseQuestionText(pp.question_content));
        });
      }

      const videoById = new Map(courseVideos.map(v => [v.id, v]));
      const responsesByVideo: VideoResponseGroup[] = progress
        .map(p => {
          const video = videoById.get(p.lecture_video_id);
          const responses = parseResponses(p.responses).map(r => ({
            ...r,
            questionText: questionTextById.get(r.pausePointId) || "Question unavailable",
          }));
          responses.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
          return {
            videoId: p.lecture_video_id,
            videoTitle: video?.title || "Untitled video",
            questionCount: video?.questionCount || 0,
            completedAt: p.completed_at,
            responses,
          };
        })
        .filter(g => g.responses.length > 0)
        .sort((a, b) => b.responses.length - a.responses.length);

      const totalResponses = responsesByVideo.reduce((s, g) => s + g.responses.length, 0);

      const recentActivity: ActivityItem[] = [
        ...progress.flatMap(p => {
          const title = videoById.get(p.lecture_video_id)?.title || "Untitled video";
          const items: ActivityItem[] = [];
          if (p.started_at) {
            items.push({ type: "video-started", description: `Started video: ${title}`, date: p.started_at });
          }
          if (p.completed_at) {
            items.push({ type: "video-completed", description: `Completed video: ${title}`, date: p.completed_at });
          }
          return items;
        }),
        ...assignments
          .filter(a => a.completed)
          .map<ActivityItem>(a => ({
            type: "checkin-completed",
            description: a.grade !== null ? `Check-in completed — ${Math.round(a.grade)}%` : "Check-in completed",
            date: a.opened_at || a.created_at,
          })),
      ]
        .filter(a => !!a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15);

      return { recentActivity, responsesByVideo, totalResponses };
    },
  });
}
