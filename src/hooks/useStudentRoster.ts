import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSeedName } from "@/lib/seedNames";
import {
  deriveRosterStudent,
  type RosterStudent,
  type CheckInInput,
  type LectureProgressInput,
} from "@/lib/studentSignals";

export interface CourseVideo {
  id: string;
  title: string;
  questionCount: number;
}

export interface StudentRosterData {
  students: RosterStudent[];
  videos: CourseVideo[];
}

const ROSTER_LIMIT = 500;
const CHUNK_SIZE = 100;

function chunk<T>(arr: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchChunked<T>(
  ids: string[],
  fetcher: (idsChunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(chunk(ids).map(fetcher));
  return results.flat();
}

export function rosterQueryKey(instructorId: string | null, courseId: string | null) {
  return ["student-roster", instructorId, courseId] as const;
}

export function useStudentRoster(instructorId: string | null, courseId: string | null) {
  return useQuery<StudentRosterData>({
    queryKey: rosterQueryKey(instructorId, courseId),
    enabled: !!instructorId && !!courseId,
    queryFn: async () => {
      if (!instructorId || !courseId) return { students: [], videos: [] };

      // Enrollment. course_id IS NULL rows are legacy enrollments that must
      // stay included or those students vanish from every course roster.
      const { data: links, error: linksError } = await supabase
        .from("instructor_students")
        .select("student_id, created_at")
        .eq("instructor_id", instructorId)
        .or(`course_id.eq.${courseId},course_id.is.null`)
        .limit(ROSTER_LIMIT);
      if (linksError) throw linksError;

      const enrolledAtById = new Map<string, string | null>();
      (links || []).forEach(l => {
        if (!enrolledAtById.has(l.student_id)) {
          enrolledAtById.set(l.student_id, l.created_at);
        }
      });
      const studentIds = [...enrolledAtById.keys()];

      // Course videos that are actually usable. `published` is true even for
      // error/analyzing rows in prod, so status='ready' is the honest filter.
      // course_id IS NULL videos are legacy uploads (same convention as
      // enrollments above) and carry real student responses — keep them.
      const { data: videoRows, error: videosError } = await supabase
        .from("lecture_videos")
        .select("id, title, question_count")
        .eq("instructor_id", instructorId)
        .or(`course_id.eq.${courseId},course_id.is.null`)
        .eq("status", "ready");
      if (videosError) throw videosError;

      const videos: CourseVideo[] = (videoRows || []).map(v => ({
        id: v.id,
        title: v.title || "Untitled video",
        questionCount: v.question_count || 0,
      }));
      const videoIds = videos.map(v => v.id);

      if (studentIds.length === 0) return { students: [], videos };

      const [profiles, stats, assignments, progress] = await Promise.all([
        fetchChunked(studentIds, async ids => {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);
          if (error) throw error;
          return data || [];
        }),
        fetchChunked(studentIds, async ids => {
          const { data, error } = await supabase
            .from("user_stats")
            .select("user_id, last_activity_date")
            .in("user_id", ids);
          if (error) throw error;
          return data || [];
        }),
        fetchChunked(studentIds, async ids => {
          const { data, error } = await supabase
            .from("student_assignments")
            .select("student_id, grade, completed, opened_at")
            .eq("assignment_type", "lecture_checkin")
            .eq("instructor_id", instructorId)
            .eq("course_id", courseId)
            .in("student_id", ids);
          if (error) throw error;
          return data || [];
        }),
        videoIds.length > 0
          ? fetchChunked(studentIds, async ids => {
              const { data, error } = await supabase
                .from("student_lecture_progress")
                .select("student_id, lecture_video_id, responses, started_at, completed_at")
                .in("lecture_video_id", videoIds)
                .in("student_id", ids);
              if (error) throw error;
              return data || [];
            })
          : Promise.resolve([]),
      ]);

      const nameById = new Map(profiles.map(p => [p.id, p.full_name || "Student"]));
      const lastActivityById = new Map(stats.map(s => [s.user_id, s.last_activity_date]));

      const checkInsById = new Map<string, CheckInInput[]>();
      assignments.forEach(a => {
        const list = checkInsById.get(a.student_id) || [];
        list.push({ grade: a.grade, completed: a.completed, opened_at: a.opened_at });
        checkInsById.set(a.student_id, list);
      });

      const progressById = new Map<string, LectureProgressInput[]>();
      progress.forEach(p => {
        const list = progressById.get(p.student_id) || [];
        list.push({
          lecture_video_id: p.lecture_video_id,
          responses: p.responses,
          started_at: p.started_at,
          completed_at: p.completed_at,
        });
        progressById.set(p.student_id, list);
      });

      const students = studentIds.map(id => {
        const name = nameById.get(id) || "Student";
        return deriveRosterStudent(
          {
            id,
            name,
            lastActivityDate: lastActivityById.get(id) ?? null,
            enrolledAt: enrolledAtById.get(id) ?? null,
            checkIns: checkInsById.get(id) || [],
            lectureProgress: progressById.get(id) || [],
            publishedVideoCount: videos.length,
          },
          isSeedName(name),
        );
      });

      return { students, videos };
    },
  });
}
