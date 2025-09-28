import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import UserStats from "@/components/UserStats";
import STEMPractice from "@/components/STEMPractice";
import AchievementSystem from "@/components/AchievementSystem";
import GameifiedLessons from "@/components/GameifiedLessons";
import ChatBox from "@/components/ChatBox";
import { toast } from "sonner";

interface User {
  id: string;
  email?: string;
}

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user || null);
        
        if (!session) {
          navigate("/");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user?.id) {
      checkOnboarding();
      fetchProfile();
      fetchLessons();
    }
  }, [user]);

  const checkSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/");
    } else {
      setSession(data.session);
      setUser(data.session.user);
    }
  };

  const checkOnboarding = async () => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .single();

    if (error || !data?.onboarded) {
      navigate("/onboarding");
    }
  };

  const fetchProfile = async () => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from("profiles")
      .select("goals")
      .eq("id", user.id)
      .single();

    if (!error && data) {
      setGoals(data.goals || []);
    }
  };

  const fetchLessons = async () => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("user_id", user.id)
      .order("step_number");

    if (error) console.error("Error fetching lessons:", error);
    setLessons(data || []);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    navigate("/");
  };

  const handleGeneratePath = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // In a real implementation, this would call your path generation API
      toast.success("Learning path generated!", {
        description: "Check your lessons below to start learning.",
      });
      fetchLessons();
    } catch (err) {
      console.error("Error generating path:", err);
      toast.error("Failed to generate learning path");
    } finally {
      setLoading(false);
    }
  };

  const handlePointsEarned = (points: number) => {
    // Trigger any global effects when points are earned
    console.log(`Points earned: ${points}`);
  };

  if (!session || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-primary bg-gradient-to-r from-card to-primary/5 shadow-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent animate-pulse-glow">
                🎮 PathQuest
              </h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                Dashboard
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {user.email || "User"}
              </span>
              <Button onClick={handleLogout} variant="destructive" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Sidebar - User Stats & Navigation */}
          <aside className="lg:col-span-3 space-y-6">
            <UserStats userId={user.id} />
            
            <Card className="p-4 bg-gradient-to-br from-card to-accent/20">
              <div className="space-y-3">
                <Button variant="retro" size="lg" className="w-full">
                  🏠 Home
                </Button>
                <Button variant="neon" size="lg" className="w-full">
                  🔍 Explore
                </Button>
                <Button variant="achievement" size="lg" className="w-full">
                  🏆 Achievements
                </Button>
              </div>
            </Card>

            <AchievementSystem userId={user.id} />
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-9 space-y-6">
            
            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-gradient-secondary border-2 border-secondary-glow text-center">
                <div className="text-2xl font-bold text-secondary-foreground">📊</div>
                <div className="text-xl font-bold text-secondary-foreground">{progress.toFixed(0)}%</div>
                <div className="text-sm text-secondary-foreground/80">Progress</div>
              </Card>
              
              <Card className="p-4 bg-gradient-energy border-2 border-energy-glow text-center">
                <div className="text-2xl font-bold text-energy-foreground">🎯</div>
                <div className="text-xl font-bold text-energy-foreground">{goals.length}</div>
                <div className="text-sm text-energy-foreground/80">Active Goals</div>
              </Card>
              
              <Card className="p-4 bg-gradient-achievement border-2 border-achievement-glow text-center">
                <div className="text-2xl font-bold text-achievement-foreground">📚</div>
                <div className="text-xl font-bold text-achievement-foreground">{lessons.length}</div>
                <div className="text-sm text-achievement-foreground/80">Total Lessons</div>
              </Card>
            </div>

            {/* Learning Path & Generation */}
            <Card className="p-6 border-2 border-primary-glow bg-gradient-to-br from-card to-primary/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  🗺️ Learning Plan Generator
                </h2>
                <Button
                  onClick={handleGeneratePath}
                  disabled={loading}
                  variant="retro"
                  size="lg"
                >
                  {loading ? "Generating..." : "🚀 Generate New Path"}
                </Button>
              </div>
              
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Current Goals: <span className="text-foreground font-semibold">
                    {goals.length > 0 ? goals.join(", ") : "No goals set"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Generate a personalized learning path based on your goals and experience level.
                </p>
              </div>
            </Card>

            {/* Two Column Layout for Main Activities */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* STEM Practice */}
              <STEMPractice 
                userId={user.id} 
                onPointsEarned={handlePointsEarned} 
              />
              
              {/* Lessons */}
              <GameifiedLessons 
                userId={user.id}
                onProgressChange={setProgress}
                onLessonComplete={handlePointsEarned}
              />
              
            </div>

            {/* Chat Interface */}
            <Card className="p-6 border-2 border-energy-glow bg-gradient-to-br from-card to-energy/5">
              <ChatBox goal={goals.join(", ")} />
            </Card>
            
          </main>
        </div>
      </div>
    </div>
  );
}