import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Users, Zap, CheckCircle2 } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";
import mockupInstructor from "@/assets/mockup-instructor-dashboard.png";
import mockupStudent from "@/assets/mockup-student-view.png";
import mockupFlow from "@/assets/mockup-live-flow.png";

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
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Floating decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large gradient orbs */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-primary/20 to-secondary/10 blur-3xl animate-pulse-soft" />
        <div className="absolute top-1/3 -left-60 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-secondary/15 to-primary/5 blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-t from-achievement/10 to-transparent blur-3xl" />
        
        {/* Geometric shapes */}
        <div className="absolute top-20 left-[15%] w-3 h-3 rounded-full bg-primary/40 animate-float" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-40 right-[20%] w-4 h-4 rounded-full bg-secondary/30 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 left-[10%] w-2 h-2 rounded-full bg-achievement/50 animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 right-[8%] w-6 h-6 rotate-45 bg-primary/10 animate-float" style={{ animationDelay: '0.8s' }} />
        <div className="absolute bottom-1/4 right-[30%] w-4 h-4 rotate-12 border-2 border-secondary/30 animate-float" style={{ animationDelay: '1.2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/30 bg-background/80 backdrop-blur-xl sticky top-0">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img src={edvanaLogo} alt="Edvana" className="h-8" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/join")} className="text-muted-foreground hover:text-foreground">
              Join Session
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="rounded-full">
              Login
            </Button>
            <button
              onClick={() => navigate("/admin/auth")}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors hidden sm:block"
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section - Asymmetric Layout */}
      <section className="relative z-10 py-12 md:py-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left content */}
            <div className="space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                AI-Powered Engagement
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1] tracking-tight">
                Know Who's
                <span className="block mt-2 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                  Actually Learning
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                AI listens to your lecture and sends smart check-ins to students. See comprehension gaps{" "}
                <span className="text-foreground font-medium">before</span> anyone falls behind.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  size="lg"
                  onClick={() => navigate("/instructor/auth")}
                  className="rounded-full px-8 gap-2 shadow-glow hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  Start Teaching Smarter
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  className="rounded-full px-8 border-border/50 hover:bg-muted/50"
                >
                  I'm a Student
                </Button>
              </div>

              {/* Trust signals */}
              <div className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Free to start
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  No credit card
                </div>
              </div>
            </div>

            {/* Right - Hero image */}
            <div className="relative animate-fade-in stagger-2">
              <div className="relative">
                {/* Main dashboard mockup */}
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-card">
                  <img 
                    src={mockupInstructor} 
                    alt="Edvana instructor dashboard" 
                    className="w-full h-auto"
                  />
                </div>
                
                {/* Student live check-in card */}
                <div className="absolute -bottom-12 -left-16 md:-left-24 w-64 md:w-80 animate-float">
                  <div className="relative bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
                    {/* Card header accent */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
                    <img 
                      src={mockupStudent} 
                      alt="Student live check-in view showing a real-time lecture question with multiple choice answers" 
                      className="w-full h-auto"
                    />
                  </div>
                </div>

                {/* Decorative badge */}
                <div className="absolute -top-4 -right-4 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg animate-gentle-bounce">
                  Live ✨
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Bento Grid */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Engagement Made <span className="text-primary">Effortless</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Three simple steps to transform passive lectures into active learning
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1 - Large card */}
            <div className="md:row-span-2 headspace-card p-8 flex flex-col justify-between animate-fade-in stagger-1">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mb-6 shadow-glow">
                  <svg className="w-7 h-7 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Step 1</div>
                <h3 className="text-2xl font-bold text-foreground mb-3">Just Teach</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Lecture normally while Edvana listens. No special setup, no interruptions to your teaching flow.
                </p>
              </div>
              <div className="mt-6 pt-6 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Real-time transcription
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="headspace-card p-6 animate-fade-in stagger-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary to-secondary-glow flex items-center justify-center mb-4 shadow-glow-secondary">
                <Zap className="w-6 h-6 text-secondary-foreground" />
              </div>
              <div className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">Step 2</div>
              <h3 className="text-xl font-bold text-foreground mb-2">AI Creates Questions</h3>
              <p className="text-sm text-muted-foreground">
                Smart check-ins generated from what you just explained
              </p>
            </div>

            {/* Step 3 */}
            <div className="headspace-card p-6 animate-fade-in stagger-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-achievement to-achievement-glow flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-achievement-foreground" />
              </div>
              <div className="text-xs font-semibold text-achievement uppercase tracking-wider mb-2">Step 3</div>
              <h3 className="text-xl font-bold text-foreground mb-2">See Who Gets It</h3>
              <p className="text-sm text-muted-foreground">
                Instant visibility into comprehension across your class
              </p>
            </div>

            {/* Flow diagram - spans 2 columns */}
            <div className="md:col-span-2 rounded-3xl overflow-hidden shadow-xl border border-border/50 animate-fade-in stagger-4">
              <img 
                src={mockupFlow} 
                alt="How Edvana connects instructors to students through AI" 
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Benefits - Overlapping cards */}
      <section className="relative z-10 py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Instructors Love Edvana
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "No More Guessing",
                description: "Know exactly who understood and who's lost — without asking",
                icon: "👁️",
                gradient: "from-primary/10 to-primary/5"
              },
              {
                title: "Contextual Questions",
                description: "AI generates check-ins based on your actual lecture content",
                icon: "🧠",
                gradient: "from-secondary/10 to-secondary/5"
              },
              {
                title: "Early Intervention",
                description: "Identify struggling students while there's still time to help",
                icon: "⚡",
                gradient: "from-achievement/10 to-achievement/5"
              }
            ].map((benefit, i) => (
              <div 
                key={i}
                className={`relative p-8 rounded-3xl bg-gradient-to-br ${benefit.gradient} border border-border/50 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 animate-fade-in`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <span className="text-4xl mb-4 block">{benefit.icon}</span>
                <h3 className="text-xl font-bold text-foreground mb-2">{benefit.title}</h3>
                <p className="text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials - Staggered layout */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="headspace-card p-8 animate-fade-in">
              <div className="text-4xl mb-4">"</div>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                I demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary" />
                <div>
                  <div className="font-semibold text-foreground">University Professor</div>
                  <div className="text-sm text-muted-foreground">Computer Science</div>
                </div>
              </div>
            </div>

            <div className="headspace-card p-8 md:mt-12 animate-fade-in stagger-2">
              <div className="text-4xl mb-4">"</div>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                It was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-achievement" />
                <div>
                  <div className="font-semibold text-foreground">Graduate Student</div>
                  <div className="text-sm text-muted-foreground">Engineering</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Bold section */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="relative rounded-[2rem] p-12 md:p-16 bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground text-center overflow-hidden">
            {/* Decorative elements inside CTA */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20">
              <div className="absolute top-4 left-4 w-20 h-20 rounded-full border-2 border-primary-foreground/30" />
              <div className="absolute bottom-8 right-8 w-32 h-32 rounded-full border-2 border-primary-foreground/20" />
              <div className="absolute top-1/2 right-1/4 w-4 h-4 rounded-full bg-primary-foreground/30" />
            </div>
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Transform Your Classroom?
              </h2>
              <p className="text-primary-foreground/80 text-lg mb-8 max-w-lg mx-auto">
                Join instructors who never wonder if students are following along
              </p>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-10 text-lg h-14 shadow-xl hover:scale-[1.02] transition-transform"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-4 border-t border-border/50">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={edvanaLogo} alt="Edvana" className="h-5 opacity-60" />
            <span>&copy; 2025 Edvana</span>
          </div>
          <button onClick={() => navigate("/admin/auth")} className="hover:text-foreground transition-colors">
            Admin Portal
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
