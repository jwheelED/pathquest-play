import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BottomNav } from "@/components/mobile/BottomNav";

// New simplified components
import { JoinClassHero } from "@/components/student/JoinClassHero";
import { SimpleClassList } from "@/components/student/SimpleClassList";
import { LectureCheckInHistory } from "@/components/student/LectureCheckInHistory";
import { RecommendedNextSteps } from "@/components/student/RecommendedNextSteps";
import { SimplifiedStudyMaterials } from "@/components/student/SimplifiedStudyMaterials";
import { ConfidenceAnalytics } from "@/components/student/ConfidenceAnalytics";
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
    }
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

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleClassJoined = () => {
    setRefreshKey(prev => prev + 1);
    setHasClasses(true);
  };

  const handleClassesLoaded = (classes: any[]) => {
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
        
        {/* Join Class Hero - Always visible and prominent */}
        <section className="animate-fade-in">
          <JoinClassHero userId={user.id} onClassJoined={handleClassJoined} />
        </section>

        {/* My Classes - Clean grid of enrolled classes */}
        <section key={refreshKey} className="animate-fade-in">
          <SimpleClassList 
            userId={user.id} 
            onClassesLoaded={handleClassesLoaded}
          />
        </section>

        {/* Two-column layout for recommendations and wrong answers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recommended Next Steps */}
          <section className="animate-fade-in">
            <RecommendedNextSteps 
              userId={user.id}
              hasClasses={hasClasses}
              wrongAnswersCount={wrongAnswersCount}
              materialsCount={materialsCount}
            />
          </section>

          {/* Questions to Review (Wrong Answers) */}
          <section className="animate-fade-in">
            <LectureCheckInHistory 
              userId={user.id} 
              limit={5}
              showOnlyWrong={true}
            />
          </section>
        </div>

        {/* Recent Check-In History */}
        <section className="animate-fade-in">
          <LectureCheckInHistory 
            userId={user.id} 
            limit={10}
            showOnlyWrong={false}
          />
        </section>

        {/* Study Materials - Simplified upload and library */}
        <section className="animate-fade-in">
          <SimplifiedStudyMaterials 
            userId={user.id}
            onMaterialCountChange={setMaterialsCount}
          />
        </section>

        {/* Confidence Analytics - Kept but simplified view */}
        <section className="animate-fade-in">
          <ConfidenceAnalytics userId={user.id} />
        </section>
      </div>

      <BottomNav role="student" />
    </DashboardShell>
  );
}
