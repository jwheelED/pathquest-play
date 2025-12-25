import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Brain, BarChart3, ArrowRight, ChevronRight } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnPage = searchParams.get("stay") === "true";

  useEffect(() => {
    const checkSessionAndRedirect = async (session: any) => {
      if (session && !stayOnPage) {
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

        navigate("/dashboard");
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkSessionAndRedirect(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        setTimeout(() => {
          checkSessionAndRedirect(session);
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, stayOnPage]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img src={edvanaLogo} alt="Edvana" className="h-8" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/join")}>
              Join Session
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Login
            </Button>
            <button
              onClick={() => navigate("/admin/auth")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
            Know Who's Following Along{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">In Real Time</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            AI listens to your lecture and sends check-in questions to students automatically. See who understood and
            who needs help — instantly.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Button
              size="lg"
              onClick={() => navigate("/instructor/auth")}
              className="w-full sm:w-auto min-w-[200px] gap-2"
            >
              I'm an Instructor
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="w-full sm:w-auto min-w-[200px] gap-2"
            >
              I'm a Student
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-foreground">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Mic className="w-8 h-8 text-primary" />
              </div>
              <div className="text-sm font-medium text-primary">Step 1</div>
              <h3 className="text-lg font-semibold text-foreground">You Teach</h3>
              <p className="text-muted-foreground text-sm">
                Lecture as normal — Edvana listens and transcribes in real-time
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Brain className="w-8 h-8 text-primary" />
              </div>
              <div className="text-sm font-medium text-primary">Step 2</div>
              <h3 className="text-lg font-semibold text-foreground">AI Generates Questions</h3>
              <p className="text-muted-foreground text-sm">
                Smart check-ins appear on student devices based on what you just said
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
              <div className="text-sm font-medium text-primary">Step 3</div>
              <h3 className="text-lg font-semibold text-foreground">See Results Instantly</h3>
              <p className="text-muted-foreground text-sm">
                Know exactly who understood and who's struggling — before they fall behind
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 border-primary/20 hover:border-primary/40 transition-colors">
              <h3 className="font-semibold text-foreground mb-2">Never wonder if students are following along</h3>
              <p className="text-sm text-muted-foreground">
                Get real-time insight into comprehension without interrupting your flow
              </p>
            </Card>

            <Card className="p-6 border-primary/20 hover:border-primary/40 transition-colors">
              <h3 className="font-semibold text-foreground mb-2">Questions based on what you just said</h3>
              <p className="text-sm text-muted-foreground">
                AI generates relevant check-ins from your actual lecture content
              </p>
            </Card>

            <Card className="p-6 border-primary/20 hover:border-primary/40 transition-colors">
              <h3 className="font-semibold text-foreground mb-2">Know who needs help before it's too late</h3>
              <p className="text-sm text-muted-foreground">
                Identify struggling students and intervene while there's still time
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6 border-primary/20">
              <p className="text-foreground italic mb-4">
                "I demoed this. It has tremendous promise for student engagement."
              </p>
              <p className="text-sm text-muted-foreground">— Professor</p>
            </Card>

            <Card className="p-6 border-primary/20">
              <p className="text-foreground italic mb-4">
                "It was quite refreshing to have quick questions about what was said a few minutes ago"
              </p>
              <p className="text-sm text-muted-foreground">— Student</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-2xl text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Ready to transform your classroom?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              onClick={() => navigate("/instructor/auth")}
              className="w-full sm:w-auto min-w-[200px] gap-2"
            >
              Get Started as Instructor
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-4 border-t border-border">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2025 Edvana. All rights reserved.</p>
          <button onClick={() => navigate("/admin/auth")} className="hover:text-foreground transition-colors">
            Admin Portal
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
