import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Video, FileText, Trophy, MessageSquareText } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
import { PreRecordedLectureList } from "@/components/student/PreRecordedLectureList";
import { StudentLectureQuestions } from "@/components/student/StudentLectureQuestions";
import { PastTranscriptsList } from "@/components/student/PastTranscriptsList";
import { ActiveLiveTranscriptSection } from "@/components/student/ActiveLiveTranscriptSection";
import { cn } from "@/lib/utils";


interface User {
  id: string;
  email?: string;
}

interface CourseInfo {
  instructorName: string;
  courseTitle: string;
  courseTopics?: string[];
  courseSchedule?: string;
}

interface ClassStats {
  itemsCompleted: number;
  averageScore: number | null;
  itemsToReview: number;
  lecturesCompleted: number;
  lecturesTotal: number;
  nextIncompleteLecture: string | null;
}

type TabValue = "assigned" | "lectures" | "transcripts" | "results";

const navItems: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "assigned", label: "Assigned Content", icon: FileText },
  { value: "lectures", label: "Pre-Recorded Lectures", icon: Video },
  { value: "transcripts", label: "Transcripts", icon: MessageSquareText },
  { value: "results", label: "Results", icon: Trophy },
];

export default function ClassDashboard() {
  const { instructorId } = useParams<{ instructorId: string }>();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("course");
  
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [classStats, setClassStats] = useState<ClassStats>({
    itemsCompleted: 0,
    averageScore: null,
    itemsToReview: 0,
    lecturesCompleted: 0,
    lecturesTotal: 0,
    nextIncompleteLecture: null,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("assigned");
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
  }, [instructorId, courseId]);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      fetchUserProfile(session.user.id);
      if (instructorId) {
        fetchCourseInfo(session.user.id, instructorId, courseId);
        fetchClassStats(session.user.id, instructorId);
      }
    }
    setLoading(false);
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    
    if (data?.full_name) {
      setUserName(data.full_name);
    }
  };

  const fetchCourseInfo = async (userId: string, instructorId: string, courseId: string | null) => {
    try {
      let enrollmentQuery = supabase
        .from("instructor_students")
        .select("id, course_id")
        .eq("student_id", userId)
        .eq("instructor_id", instructorId);

      if (courseId) {
        enrollmentQuery = enrollmentQuery.eq("course_id", courseId);
      } else {
        enrollmentQuery = enrollmentQuery.is("course_id", null);
      }

      const { data: connection } = await enrollmentQuery.maybeSingle();

      if (!connection) {
        navigate("/dashboard");
        return;
      }

      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("title, description, topics, schedule, instructor_id")
          .eq("id", courseId)
          .single();

        if (course) {
          const { data: instructor } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", course.instructor_id)
            .single();

          setCourseInfo({
            instructorName: instructor?.full_name || "Your Instructor",
            courseTitle: course.title || "No Course Title",
            courseTopics: course.topics || undefined,
            courseSchedule: course.schedule || undefined,
          });
          return;
        }
      }

      const { data: instructor } = await supabase
        .from("profiles")
        .select("full_name, course_title, course_topics, course_schedule")
        .eq("id", instructorId)
        .single();

      if (instructor) {
        setCourseInfo({
          instructorName: instructor.full_name || "Your Instructor",
          courseTitle: instructor.course_title || "No Course Title",
          courseTopics: instructor.course_topics,
          courseSchedule: instructor.course_schedule,
        });
      }
    } catch (error) {
      console.error("Error fetching course info:", error);
    }
  };

  const fetchClassStats = async (userId: string, instructorId: string) => {
    try {
      // Fetch completed assignments
      const { data: assignments } = await supabase
        .from("student_assignments")
        .select("id, grade, completed")
        .eq("student_id", userId)
        .eq("instructor_id", instructorId)
        .eq("completed", true);

      // Fetch pre-recorded lectures for this instructor
      const { data: lectures } = await supabase
        .from("lecture_videos")
        .select("id, title")
        .eq("instructor_id", instructorId)
        .eq("status", "ready")
        .eq("published", true);

      const lectureIds = lectures?.map(l => l.id) || [];

      // Fetch student progress on those lectures
      const { data: progress } = lectureIds.length > 0
        ? await supabase
            .from("student_lecture_progress")
            .select("id, lecture_video_id, completed_at")
            .eq("student_id", userId)
            .in("lecture_video_id", lectureIds)
        : { data: [] };

      const completedLectureIds = new Set(
        (progress || []).filter(p => p.completed_at).map(p => p.lecture_video_id)
      );
      const startedLectureIds = new Set(
        (progress || []).map(p => p.lecture_video_id)
      );

      const completedAssignments = assignments || [];
      const grades = completedAssignments
        .map(a => a.grade)
        .filter((g): g is number => g !== null && g !== undefined);
      const avgScore = grades.length > 0
        ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length)
        : null;
      const lowGradeCount = grades.filter(g => g < 70).length;

      // Find next incomplete lecture
      let nextIncompleteLecture: string | null = null;
      if (lectures) {
        for (const l of lectures) {
          if (!completedLectureIds.has(l.id)) {
            nextIncompleteLecture = l.title;
            break;
          }
        }
      }

      setClassStats({
        itemsCompleted: completedAssignments.length + completedLectureIds.size,
        averageScore: avgScore,
        itemsToReview: lowGradeCount,
        lecturesCompleted: completedLectureIds.size,
        lecturesTotal: lectureIds.length,
        nextIncompleteLecture,
      });
    } catch (error) {
      console.error("Error fetching class stats:", error);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen mastery-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-charcoal-muted">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen mastery-bg relative pb-20 md:pb-0">
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={{ level: 1, streak: 0 }}
      />

      {/* Desktop Header */}
      <header className="hidden md:block bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/dashboard");
                }}
                className="gap-2 rounded-full text-charcoal-muted hover:text-charcoal hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-base font-semibold text-charcoal">
                    {courseInfo?.courseTitle || "Class Dashboard"}
                  </h1>
                  {courseInfo?.instructorName && (
                    <p className="text-xs text-charcoal-subtle">{courseInfo.instructorName}</p>
                  )}
                </div>
              </div>
            </div>
            <span className="text-xs text-charcoal-muted">
              {user?.email || "User"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 relative">
        {/* Mobile Tab Navigation */}
        <div className="lg:hidden mb-4">
          <div className="flex gap-1 p-1 bg-white rounded-xl border border-slate-100 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-1 justify-center",
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-charcoal-muted hover:text-charcoal hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)]">
          {/* Sidebar Navigation - Desktop Only */}
          <aside className="hidden lg:flex w-52 flex-col pr-6 mr-6 shrink-0">
            <nav className="flex flex-col gap-1 sticky top-20">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                      isActive
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-charcoal-muted hover:text-charcoal hover:bg-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Overview removed — Assigned Content is the default landing tab */}
            
            {activeTab === "assigned" && user && (
              <div className="space-y-6 animate-fade-in">
                <AssignedContent
                  userId={user.id}
                  instructorId={instructorId}
                  courseId={courseId ?? undefined}
                />
              </div>
            )}
            
            {activeTab === "lectures" && (
              <div className="space-y-6 animate-fade-in">
                <PreRecordedLectureList instructorId={instructorId} />
              </div>
            )}

            {activeTab === "transcripts" && (
              <div className="space-y-6 animate-fade-in">
                <ActiveLiveTranscriptSection instructorId={instructorId} courseId={courseId ?? undefined} />
                <PastTranscriptsList instructorId={instructorId} courseId={courseId ?? undefined} />
              </div>
            )}
            
            {activeTab === "results" && (
              <div className="space-y-6 animate-fade-in">
                <StudentLectureQuestions instructorId={instructorId} />
              </div>
            )}
          </main>
        </div>
      </div>

      <BottomNav role="student" />
    </div>
  );
}
