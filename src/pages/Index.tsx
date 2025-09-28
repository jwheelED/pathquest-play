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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (session) {
          navigate("/dashboard");
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
            🎮 PathQuest
          </h1>
          <p className="text-2xl font-semibold text-primary">
            Gamified STEM Learning Platform
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Level up your knowledge with personalized learning paths, spaced repetition, 
            achievements, and retro-style gamification!
          </p>
        </div>

        <Card className="p-8 bg-gradient-to-br from-card to-primary/10 border-2 border-primary-glow shadow-glow max-w-md mx-auto">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="text-4xl">🚀</div>
              <h2 className="text-xl font-bold text-foreground">Ready to Start Learning?</h2>
              <p className="text-sm text-muted-foreground">
                Join thousands of learners earning XP, unlocking achievements, and mastering STEM subjects.
              </p>
            </div>
            
            <div className="space-y-3">
              <Button 
                onClick={() => navigate("/auth")}
                variant="retro"
                size="xl"
                className="w-full"
              >
                🎯 Start Your Quest
              </Button>
              
              <p className="text-xs text-muted-foreground">
                New to PathQuest? Sign up and complete onboarding to get started!
              </p>
            </div>
          </div>
        </Card>

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
