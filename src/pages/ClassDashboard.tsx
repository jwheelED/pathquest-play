import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Calendar, Sparkles } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
// FlowStateCard removed
import { FloatingDecorations } from "@/components/student/FloatingDecorations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PreRecordedLectureList } from "@/components/student/PreRecordedLectureList";

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

export default function ClassDashboard() {
  const { instructorId } = useParams<{ instructorId: string }>();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("course");
  
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Flow state removed

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

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
          {/* Course Information - Headspace Style */}
          {courseInfo && (
            <div className="col-span-1 lg:col-span-5 animate-fade-in">
              <div className="headspace-card p-6 h-full">
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


          {/* Interactive Pre-Recorded Lectures */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-2">
            <PreRecordedLectureList instructorId={instructorId} />
          </div>

          {/* Assigned Content for this class */}
          <div className="col-span-1 lg:col-span-12 animate-fade-in stagger-3">
            <AssignedContent 
              userId={user.id} 
              instructorId={instructorId}
            />
          </div>
        </div>
      </div>

      <BottomNav role="student" />
    </div>
  );
}
