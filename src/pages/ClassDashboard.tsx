import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Calendar, Sparkles, LayoutDashboard, Video, FileText, Trophy, CheckCircle2, Target, PlayCircle, TrendingUp, Users } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
import { FloatingDecorations } from "@/components/student/FloatingDecorations";
import { PreRecordedLectureList } from "@/components/student/PreRecordedLectureList";
import { StudentLectureQuestions } from "@/components/student/StudentLectureQuestions";
import { MetricCard } from "@/components/dashboard/MetricCard";
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen headspace-bg relative pb-20 md:pb-0">
      <FloatingDecorations variant="minimal" />
      
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={{ level: 1, streak: 0 }}
      />

      {/* Desktop Header */}
      <header className="hidden md:block bg-card/80 backdrop-blur-sm shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/dashboard");
                }}
                className="gap-2 rounded-full hover:bg-accent pointer-events-auto relative z-10"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-bold text-foreground">
                  {courseInfo?.courseTitle || "Class Dashboard"}
                </h1>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {user?.email || "User"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8 relative">
        {/* Mobile Tab Navigation */}
        <div className="lg:hidden mb-4">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto">
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
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
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
          <aside className="hidden lg:flex w-56 flex-col border-r border-border/50 pr-6 mr-6 shrink-0">
            <nav className="flex flex-col gap-1 sticky top-24">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-5 w-5" />
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
                {/* Course Header Row */}
                {courseInfo && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{courseInfo.instructorName}</span>
                    </div>
                    {courseInfo.courseSchedule && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{courseInfo.courseSchedule}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Completed"
                    value={classStats.itemsCompleted}
                    description="Assignments & lectures"
                    size="sm"
                    variant="success"
                  />
                  <MetricCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="Avg Score"
                    value={classStats.averageScore !== null ? `${classStats.averageScore}%` : "—"}
                    description={
                      classStats.averageScore !== null
                        ? classStats.averageScore >= 70
                          ? "Strong performance"
                          : classStats.averageScore >= 40
                            ? "Room to improve"
                            : "Needs review"
                        : "No grades yet"
                    }
                    size="sm"
                    variant={
                      classStats.averageScore !== null
                        ? classStats.averageScore >= 70
                          ? "success"
                          : "warning"
                        : "default"
                    }
                  />
                  <MetricCard
                    icon={<Target className="h-4 w-4" />}
                    label="To Review"
                    value={classStats.itemsToReview}
                    description="Items below 70%"
                    size="sm"
                    variant={classStats.itemsToReview > 0 ? "warning" : "default"}
                  />
                  <MetricCard
                    icon={<Video className="h-4 w-4" />}
                    label="Lectures"
                    value={classStats.lecturesTotal > 0 ? `${classStats.lecturesCompleted}/${classStats.lecturesTotal}` : "—"}
                    description={classStats.lecturesTotal > 0 ? "Pre-recorded progress" : "None available"}
                    size="sm"
                    variant="primary"
                  />
                </div>

                {/* Next Action Banner */}
                {classStats.nextIncompleteLecture ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <PlayCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">Continue watching</p>
                      <p className="text-sm text-muted-foreground truncate">{classStats.nextIncompleteLecture}</p>
                    </div>
                    <Button size="sm" onClick={() => setActiveTab("lectures")} className="flex-shrink-0">
                      Go
                    </Button>
                  </div>
                ) : classStats.itemsToReview > 0 ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Target className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">Review {classStats.itemsToReview} missed item{classStats.itemsToReview > 1 ? "s" : ""}</p>
                      <p className="text-sm text-muted-foreground">Check feedback to improve your understanding</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setActiveTab("results")} className="flex-shrink-0 border-amber-500/30 text-amber-700 hover:bg-amber-500/10">
                      Review
                    </Button>
                  </div>
                ) : classStats.itemsCompleted > 0 ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">You're all caught up — keep it going!</p>
                  </div>
                ) : null}

                {/* Quick Links */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setActiveTab("assigned")}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Assigned Content</p>
                      <p className="text-xs text-muted-foreground">Quizzes & assignments</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("lectures")}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <Video className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Pre-Recorded Lectures</p>
                      <p className="text-xs text-muted-foreground">Watch & answer questions</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("results")}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <Trophy className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">View Results</p>
                      <p className="text-xs text-muted-foreground">Grades & feedback</p>
                    </div>
                  </button>
                </div>

                {/* Topic Tags */}
                {courseInfo?.courseTopics && courseInfo.courseTopics.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Topics Covered</h3>
                    <div className="flex flex-wrap gap-2">
                      {courseInfo.courseTopics.map((topic, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-secondary/15 text-secondary rounded-full text-xs font-medium"
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
