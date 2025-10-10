// Update this page (the content is just a fallback if you fail to update the page)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSessionAndRedirect = async (session: any) => {
      if (session) {
        // Check for admin role
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        
        if (adminRole) {
          navigate("/admin/dashboard");
          return;
        }
        
        // Check for instructor role
        const { data: instructorRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "instructor")
          .maybeSingle();
        
        if (instructorRole) {
          navigate("/instructor/dashboard");
          return;
        }
        
        // Default to student dashboard
        navigate("/dashboard");
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkSessionAndRedirect(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (session) {
          setTimeout(() => {
            checkSessionAndRedirect(session);
          }, 0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-pulse-glow">
            🎮 Edvana
          </h1>
          <p className="text-2xl font-semibold text-primary">
            Gamified STEM Learning Platform
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Level up your knowledge with personalized learning paths, spaced repetition, 
            achievements, and retro-style gamification!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Student Path */}
          <Card className="p-8 bg-gradient-to-br from-card to-primary/10 border-2 border-primary-glow shadow-glow hover:shadow-elegant transition-all">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="text-5xl">🎮</div>
                <h2 className="text-2xl font-bold text-foreground">I'm a Student</h2>
                <p className="text-sm text-muted-foreground">
                  Join thousands of learners earning XP, unlocking achievements, and mastering STEM subjects through gamified learning.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={() => navigate("/auth")}
                  variant="retro"
                  size="lg"
                  className="w-full"
                >
                  🎯 Start Learning
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  Sign up and complete onboarding to begin your quest!
                </p>
              </div>
            </div>
          </Card>

          {/* Instructor Path */}
          <Card className="p-8 bg-gradient-to-br from-card to-secondary/10 border-2 border-secondary-glow shadow-glow hover:shadow-elegant transition-all">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="text-5xl">👨‍🏫</div>
                <h2 className="text-2xl font-bold text-foreground">I'm an Instructor</h2>
                <p className="text-sm text-muted-foreground">
                  Track student progress, provide support, communicate with learners, and monitor achievement across your classroom.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={() => navigate("/instructor/auth")}
                  variant="retro"
                  size="lg"
                  className="w-full bg-secondary hover:bg-secondary/90"
                >
                  📊 Instructor Portal
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  Sign in to access your instructor dashboard
                </p>
              </div>
            </div>
          </Card>

          {/* Administrator Path */}
          <Card className="p-8 bg-gradient-to-br from-card to-accent/10 border-2 border-accent shadow-glow hover:shadow-elegant transition-all">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="text-5xl">🏢</div>
                <h2 className="text-2xl font-bold text-foreground">I'm an Admin</h2>
                <p className="text-sm text-muted-foreground">
                  Access school-wide analytics, ROI metrics, exportable reports, and comprehensive engagement data.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={() => navigate("/admin/auth")}
                  variant="retro"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  📈 Admin Portal
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  Sign in to access analytics and reports
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <Card className="p-4 bg-gradient-secondary border border-secondary-glow">
            <div className="text-2xl mb-2">🧠</div>
            <h3 className="font-semibold text-secondary-foreground">STEM Problems</h3>
            <p className="text-sm text-secondary-foreground/80">Practice with spaced repetition</p>
          </Card>
          
          <Card className="p-4 bg-gradient-achievement border border-achievement-glow">
            <div className="text-2xl mb-2">🏆</div>
            <h3 className="font-semibold text-achievement-foreground">Achievements</h3>
            <p className="text-sm text-achievement-foreground/80">Unlock rewards and level up</p>
          </Card>
          
          <Card className="p-4 bg-gradient-energy border border-energy-glow">
            <div className="text-2xl mb-2">📚</div>
            <h3 className="font-semibold text-energy-foreground">Learning Paths</h3>
            <p className="text-sm text-energy-foreground/80">AI-generated personalized courses</p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
