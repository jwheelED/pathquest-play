import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BottomNav } from "@/components/mobile/BottomNav";

import { NextActionBanner } from "@/components/student/NextActionBanner";
import { JoinClassHero } from "@/components/student/JoinClassHero";
import { SimpleClassList } from "@/components/student/SimpleClassList";
import { LectureCheckInHistory } from "@/components/student/LectureCheckInHistory";
import { SimplifiedStudyMaterials } from "@/components/student/SimplifiedStudyMaterials";
import { PracticeQuestionsCard } from "@/components/student/PracticeQuestionsCard";

import { logger } from "@/lib/logger";

interface User {
  id: string;
  email?: string;
}

export default function StudentTraining() {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [hasClasses, setHasClasses] = useState(false);
  const [wrongAnswersCount, setWrongAnswersCount] = useState(0);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [hasLiveSession, setHasLiveSession] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      fetchUserProfile(session.user.id);
      fetchWrongAnswersCount(session.user.id);
      fetchLiveSessionStatus(session.user.id);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    if (data?.full_name) setUserName(data.full_name);
  };

  const fetchWrongAnswersCount = async (userId: string) => {
    try {
      const { count } = await supabase
        .from("student_assignments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", userId)
        .eq("assignment_type", "lecture_checkin")
        .eq("completed", true)
        .or("grade.lt.70");
      setWrongAnswersCount(count || 0);
    } catch (error) {
      logger.error("Error fetching wrong answers count:", error);
    }
  };

  const fetchLiveSessionStatus = async (userId: string) => {
    try {
      const { data: connections } = await supabase
        .from("instructor_students")
        .select("instructor_id, course_id")
        .eq("student_id", userId);

      if (!connections || connections.length === 0) return;

      const instructorIds = [...new Set(connections.map(c => c.instructor_id))];
      const now = new Date().toISOString();

      const { data: liveSessions } = await supabase
        .from("live_sessions")
        .select("id")
        .in("instructor_id", instructorIds)
        .eq("is_active", true)
        .gt("ends_at", now)
        .limit(1);

      setHasLiveSession((liveSessions?.length || 0) > 0);
    } catch (error) {
      logger.error("Error checking live sessions:", error);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleClassJoined = () => {
    setRefreshKey(prev => prev + 1);
    setHasClasses(true);
    fetchLiveSessionStatus(user!.id);
  };

  const handleClassesLoaded = (classes: unknown[]) => {
    setHasClasses(classes.length > 0);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardShell
      role="student"
      userName={userName || user.email || "Student"}
      userEmail={user.email || ""}
      userId={user.id}
      onLogout={handleLogout}
      stats={{ level: 1, streak: 0 }}
      title="My Learning"
      subtitle="Stay on track with your classes"
    >
      <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
        {/* 1. Next Action Banner */}
        <section className="animate-fade-in">
          <NextActionBanner
            userId={user.id}
            hasClasses={hasClasses}
            wrongAnswersCount={wrongAnswersCount}
            materialsCount={materialsCount}
            hasLiveSession={hasLiveSession}
          />
        </section>

        {/* 2. Join a Class */}
        <section className="animate-fade-in">
          <JoinClassHero userId={user.id} onClassJoined={handleClassJoined} />
        </section>

        {/* 3. My Classes */}
        <section key={refreshKey} className="animate-fade-in">
          <SimpleClassList userId={user.id} onClassesLoaded={handleClassesLoaded} />
        </section>

        {/* 3. Questions to Review */}
        <section id="review-section" className="animate-fade-in">
          <LectureCheckInHistory userId={user.id} limit={5} showOnlyWrong={true} />
        </section>

        {/* 4. Recent Check-Ins + Study Materials */}
        <section className="animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LectureCheckInHistory userId={user.id} limit={5} showOnlyWrong={false} />
          <SimplifiedStudyMaterials userId={user.id} onMaterialCountChange={setMaterialsCount} />
        </section>

        {/* 5. Practice Questions */}
        <section className="animate-fade-in">
          <PracticeQuestionsCard userId={user.id} />
        </section>
      </div>

      <BottomNav role="student" />
    </DashboardShell>
  );
}
