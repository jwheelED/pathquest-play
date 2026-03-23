import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Calendar, Sparkles, LayoutDashboard, Video, FileText, Trophy, CheckCircle2, Target, PlayCircle, TrendingUp, Users, ChevronRight } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
import { PreRecordedLectureList } from "@/components/student/PreRecordedLectureList";
import { StudentLectureQuestions } from "@/components/student/StudentLectureQuestions";
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

type TabValue = "overview" | "assigned" | "lectures" | "results";

const navItems: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "assigned", label: "Assigned Content", icon: FileText },
  { value: "lectures", label: "Pre-Recorded Lectures", icon: Video },
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
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
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
            {activeTab === "overview" && (
              <div className="space-y-6 animate-fade-in">
                {/* Course Info Strip */}
                {courseInfo && (
                  <div className="command-card px-4 py-3">
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-2 text-charcoal-muted">
                        <Users className="h-4 w-4 text-charcoal-subtle" />
                        <span>{courseInfo.instructorName}</span>
                      </div>
                      {courseInfo.courseSchedule && (
                        <div className="flex items-center gap-2 text-charcoal-muted">
                          <Calendar className="h-4 w-4 text-charcoal-subtle" />
                          <span>{courseInfo.courseSchedule}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="signal-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-[10px] font-semibold text-charcoal-subtle uppercase tracking-wide">Completed</span>
                    </div>
                    <p className="text-2xl font-semibold text-charcoal">{classStats.itemsCompleted}</p>
                    <p className="text-xs text-charcoal-subtle mt-0.5">Assignments & lectures</p>
                  </div>
                  
                  <div className="signal-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-sky-600" />
                      <span className="text-[10px] font-semibold text-charcoal-subtle uppercase tracking-wide">Avg Score</span>
                    </div>
                    <p className={cn(
                      "text-2xl font-semibold",
                      classStats.averageScore !== null && classStats.averageScore >= 70 
                        ? "text-emerald-600" 
                        : classStats.averageScore !== null && classStats.averageScore >= 40
                          ? "text-amber-600"
                          : "text-charcoal"
                    )}>
                      {classStats.averageScore !== null ? `${classStats.averageScore}%` : "—"}
                    </p>
                    <p className="text-xs text-charcoal-subtle mt-0.5">
                      {classStats.averageScore !== null
                        ? classStats.averageScore >= 70
                          ? "Strong performance"
                          : classStats.averageScore >= 40
                            ? "Room to improve"
                            : "Needs review"
                        : "No grades yet"}
                    </p>
                  </div>
                  
                  <div className="signal-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-amber-600" />
                      <span className="text-[10px] font-semibold text-charcoal-subtle uppercase tracking-wide">To Review</span>
                    </div>
                    <p className={cn(
                      "text-2xl font-semibold",
                      classStats.itemsToReview > 0 ? "text-amber-600" : "text-charcoal"
                    )}>
                      {classStats.itemsToReview}
                    </p>
                    <p className="text-xs text-charcoal-subtle mt-0.5">Items below 70%</p>
                  </div>
                  
                  <div className="signal-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="h-4 w-4 text-violet-600" />
                      <span className="text-[10px] font-semibold text-charcoal-subtle uppercase tracking-wide">Lectures</span>
                    </div>
                    <p className="text-2xl font-semibold text-charcoal">
                      {classStats.lecturesTotal > 0 ? `${classStats.lecturesCompleted}/${classStats.lecturesTotal}` : "—"}
                    </p>
                    <p className="text-xs text-charcoal-subtle mt-0.5">
                      {classStats.lecturesTotal > 0 ? "Pre-recorded progress" : "None available"}
                    </p>
                  </div>
                </div>

                {/* Next Action Banner */}
                {classStats.nextIncompleteLecture ? (
                  <div className="command-card p-4 border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                        <PlayCircle className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-charcoal">Continue watching</p>
                        <p className="text-sm text-charcoal-muted truncate">{classStats.nextIncompleteLecture}</p>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => setActiveTab("lectures")} 
                        className="flex-shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-4"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                ) : classStats.itemsToReview > 0 ? (
                  <div className="command-card p-4 border-l-4 border-l-amber-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                        <Target className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-charcoal">
                          Review {classStats.itemsToReview} missed item{classStats.itemsToReview > 1 ? "s" : ""}
                        </p>
                        <p className="text-sm text-charcoal-muted">Check feedback to improve your understanding</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setActiveTab("results")} 
                        className="flex-shrink-0 rounded-full border-amber-300 text-amber-700 hover:bg-amber-50 px-4"
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                ) : classStats.itemsCompleted > 0 ? (
                  <div className="command-card p-3 bg-emerald-50/50 border-emerald-100">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-700 font-medium">You're all caught up — keep it going!</p>
                    </div>
                  </div>
                ) : null}

                {/* Quick Links */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setActiveTab("assigned")}
                    className="command-card p-4 hover:border-slate-200 transition-colors text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center">
                          <FileText className="h-4 w-4 text-sky-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">Assigned Content</p>
                          <p className="text-xs text-charcoal-subtle">Quizzes & assignments</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-charcoal-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("lectures")}
                    className="command-card p-4 hover:border-slate-200 transition-colors text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                          <Video className="h-4 w-4 text-violet-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">Pre-Recorded Lectures</p>
                          <p className="text-xs text-charcoal-subtle">Watch & answer questions</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-charcoal-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("results")}
                    className="command-card p-4 hover:border-slate-200 transition-colors text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
                          <Trophy className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">View Results</p>
                          <p className="text-xs text-charcoal-subtle">Grades & feedback</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-charcoal-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                </div>

                {/* Topic Tags */}
                {courseInfo?.courseTopics && courseInfo.courseTopics.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-[10px] font-semibold text-charcoal-subtle mb-3 uppercase tracking-widest">Topics Covered</h3>
                    <div className="flex flex-wrap gap-2">
                      {courseInfo.courseTopics.map((topic, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-slate-50 text-charcoal-muted border border-slate-100 rounded-full text-xs font-medium"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
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
