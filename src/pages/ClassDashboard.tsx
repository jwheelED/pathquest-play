import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { AssignedContent } from "@/components/student/AssignedContent";
import { FlowStateCard } from "@/components/student/FlowStateCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
  }, [instructorId]);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      fetchUserProfile(session.user.id);
      if (instructorId) {
        fetchCourseInfo(session.user.id, instructorId);
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

  const fetchCourseInfo = async (userId: string, instructorId: string) => {
    try {
      // Verify student is connected to this instructor
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("id")
        .eq("student_id", userId)
        .eq("instructor_id", instructorId)
        .maybeSingle();

      if (!connection) {
        navigate("/dashboard");
        return;
      }

      // Fetch instructor details
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

  const handleAnswerResult = (isCorrect: boolean, grade: number) => {
    window.dispatchEvent(
      new CustomEvent("flowstate:answer", {
        detail: { isCorrect, grade },
      })
    );
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
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <MobileHeader
        userName={userName || user.email || "Student"}
        userEmail={user.email || ""}
        role="student"
        onLogout={handleLogout}
        stats={{ level: 1, streak: 0 }}
      />

      <header className="hidden md:block border-b-2 border-primary bg-gradient-to-r from-card to-primary/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/dashboard")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Training
              </Button>
              <div className="flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
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

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className="space-y-4 md:space-y-6">
          {/* Course Information */}
          {courseInfo && (
            <Card className="border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Course Information
                </CardTitle>
                <CardDescription>
                  Instructor: {courseInfo.instructorName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {courseInfo.courseTopics && courseInfo.courseTopics.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">Topics Covered</h3>
                    <div className="flex flex-wrap gap-2">
                      {courseInfo.courseTopics.map((topic, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {courseInfo.courseSchedule && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-1">Schedule</h3>
                    <p className="text-foreground">{courseInfo.courseSchedule}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Flow State Visualization */}
          <FlowStateCard userId={user.id} instructorId={instructorId} />

          {/* Assigned Content for this class */}
          <AssignedContent 
            userId={user.id} 
            instructorId={instructorId}
            onAnswerResult={handleAnswerResult}
          />
        </div>
      </div>

      <BottomNav role="student" />
    </div>
  );
}
