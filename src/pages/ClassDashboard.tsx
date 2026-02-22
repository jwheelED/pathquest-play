import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Calendar, Sparkles, LayoutDashboard, Video, FileText, Trophy } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
import { FloatingDecorations } from "@/components/student/FloatingDecorations";
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
      // Build enrollment check query
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

      // If we have a course_id, fetch from courses table
      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("title, description, topics, schedule, instructor_id")
          .eq("id", courseId)
          .single();

        if (course) {
          // Get instructor name
          const { data: instructor } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", course.instructor_id)
            .single();

          setCourseInfo({
            instructorName: instructor?.full_name || "Unknown Instructor",
            courseTitle: course.title || "No Course Title",
            courseTopics: course.topics || undefined,
            courseSchedule: course.schedule || undefined,
          });
          return;
        }
      }

      // Fallback to legacy instructor profile
      const { data: instructor } = await supabase
        .from("profiles")
        .select("full_name, course_title, course_topics, course_schedule")
        .eq("id", instructorId)
        .single();

      if (instructor) {
        setCourseInfo({
          instructorName: instructor.full_name || "Unknown Instructor",
          courseTitle: instructor.course_title || "No Course Title",
          courseTopics: instructor.course_topics,
          courseSchedule: instructor.course_schedule,
        });
      }
    } catch (error) {
      console.error("Error fetching course info:", error);
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
      {/* Floating Decorations */}
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
        {/* Mobile Tab Navigation - Outside the flex container */}
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
                    onClick={() => {
                      console.log('🔄 Desktop sidebar tab clicked:', item.value);
                      setActiveTab(item.value);
                    }}
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
              <div className="space-y-6">
                {courseInfo && (
                  <div className="animate-fade-in">
                    <div className="headspace-card p-6">
                      <div className="flex items-start gap-4 mb-5">
                        <div className="w-14 h-14 rounded-3xl bg-accent flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-7 h-7 text-foreground" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-foreground mb-1">Course Information</h2>
                          <p className="text-muted-foreground text-sm">
                            Instructor: {courseInfo.instructorName}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {courseInfo.courseSchedule && (
                          <div className="flex items-center gap-3 p-3 rounded-2xl bg-accent/50">
                            <Calendar className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Schedule</p>
                              <p className="text-sm font-medium text-foreground">{courseInfo.courseSchedule}</p>
                            </div>
                          </div>
                        )}
                        
                        {courseInfo.courseTopics && courseInfo.courseTopics.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Topics Covered</h3>
                            <div className="flex flex-wrap gap-2">
                              {courseInfo.courseTopics.map((topic, idx) => (
                                <span
                                  key={idx}
                                  className="px-4 py-2 bg-secondary/15 text-secondary rounded-full text-sm font-medium"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
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
