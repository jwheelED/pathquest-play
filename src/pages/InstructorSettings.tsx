import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from "lucide-react";
import { toast } from "sonner";
import { QuestionFormatSettings } from "@/components/instructor/QuestionFormatSettings";
import { AutoGradeSettings } from "@/components/instructor/AutoGradeSettings";

export default function InstructorSettings() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [professorType, setProfessorType] = useState<"stem" | "humanities" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/instructor/auth");
      return;
    }

    // Verify instructor role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "instructor")
      .maybeSingle();
    
    if (!roleData) {
      toast.error("Access denied. Instructor privileges required.");
      navigate("/instructor/auth");
      return;
    }
    
    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("professor_type")
      .eq("id", session.user.id)
      .single();
    
    setCurrentUser(session.user);
    setProfessorType(profile?.professor_type || null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/10">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-primary truncate">Instructor Settings</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Configure question and grading preferences</p>
            </div>
          </div>
          <Button onClick={() => navigate("/instructor/dashboard")} variant="outline" size="sm" className="gap-1 sm:gap-2 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {currentUser && (
            <>
              <QuestionFormatSettings instructorId={currentUser.id} professorType={professorType} />
              <AutoGradeSettings />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
