import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Users, Zap, CheckCircle2, Star, BookOpen, TrendingUp, Shield } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";
import step1Image from "@/assets/step1-live-lecture.png";
import step2Image from "@/assets/step2-question.png";
import step3Image from "@/assets/step3-feedback.png";
import { useScrollAnimation, useScrollPosition } from "@/hooks/useScrollAnimation";
import { StickyCtaBar } from "@/components/StickyCtaBar";

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnPage = searchParams.get("stay") === "true";
  const { scrollY } = useScrollPosition();
  
  // Scroll animation refs for each section
  const step1Ref = useScrollAnimation(0.2);
  const step2Ref = useScrollAnimation(0.2);
  const step3Ref = useScrollAnimation(0.2);
  const benefitsRef = useScrollAnimation(0.2);
  const testimonialsRef = useScrollAnimation(0.2);

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

  // Smooth scroll to section
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Enhanced floating decorative elements with parallax */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large gradient orbs with parallax */}
        <div 
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-primary/20 to-secondary/10 blur-3xl animate-pulse-soft"
          style={{ transform: `translateY(${scrollY * 0.3}px)` }}
        />
        <div 
          className="absolute top-1/3 -left-60 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-secondary/15 to-primary/5 blur-3xl animate-float"
          style={{ transform: `translateY(${scrollY * 0.2}px)` }}
        />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-t from-achievement/10 to-transparent blur-3xl" />
        
        {/* Animated geometric shapes */}
        <div className="absolute top-20 left-[15%] w-3 h-3 rounded-full bg-primary/40 animate-float" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-40 right-[20%] w-4 h-4 rounded-full bg-secondary/30 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 left-[10%] w-2 h-2 rounded-full bg-achievement/50 animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 right-[8%] w-6 h-6 rotate-45 bg-primary/10 animate-float" style={{ animationDelay: '0.8s' }} />
        <div className="absolute bottom-1/4 right-[30%] w-4 h-4 rotate-12 border-2 border-secondary/30 animate-float" style={{ animationDelay: '1.2s' }} />
        
        {/* Additional particles */}
        <div className="absolute top-[60%] left-[20%] w-2 h-2 rounded-full bg-energy/40 animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] right-[15%] w-3 h-3 rounded-full bg-primary/20 animate-float" style={{ animationDelay: '1.8s' }} />
      </div>

      {/* Header with enhanced styling */}
      <header className="relative z-10 border-b border-border/30 bg-background/80 backdrop-blur-xl sticky top-0 transition-all duration-300">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => scrollToSection('hero')}>
            <img src={edvanaLogo} alt="Edvana" className="h-8 transition-transform hover:scale-105" />
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/join")} 
              className="text-muted-foreground hover:text-foreground"
            >
              Join Session
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/auth")} 
              className="rounded-full hover:scale-105 transition-transform"
            >
              Student Login
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/instructor/auth")}
              className="rounded-full hidden md:flex"
            >
              Instructor Login
            </Button>
          </div>
        </div>
      </header>

      {/* Enhanced Hero Section */}
      <section id="hero" className="relative z-10 py-16 md:py-24 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-fade-in backdrop-blur-sm border border-primary/20">
              <Sparkles className="w-4 h-4 animate-pulse" />
              Smart Engagement Platform
            </div>
            
            {/* Main Heading with enhanced gradient */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.1] tracking-tight animate-fade-in">
              Know Who's
              <span className="block mt-2 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent animate-gradient">
                Actually Learning
              </span>
            </h1>
            
            {/* Subheading */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in stagger-2">
              AI listens to your lecture and sends smart check-ins to students. See comprehension gaps{" "}
              <span className="text-foreground font-medium">before</span> anyone falls behind.
            </p>

            {/* CTAs with enhanced styling */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center animate-fade-in stagger-3">
              <Button
                size="lg"
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-8 gap-2 shadow-glow hover:shadow-xl transition-all duration-300 hover:scale-105 group"
              >
                <Users className="w-4 h-4" />
                For Instructors
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/auth")}
                className="rounded-full px-8 border-border/50 hover:bg-muted/50 hover:scale-105 transition-all gap-2"
              >
                <BookOpen className="w-4 h-4" />
                For Students
              </Button>
            </div>

            {/* Trust signals with icons */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-muted-foreground animate-fade-in stagger-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Free to start
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                No credit card
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Secure & Private
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Enhanced with scroll animations */}
      <section id="how-it-works" className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Engagement Made <span className="text-primary">Effortless</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Three simple steps to transform passive lectures into active learning
            </p>
          </div>

          {/* Steps with enhanced animations */}
          <div className="space-y-24">
            {/* Step 1 */}
            <div 
              ref={step1Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step1Ref.isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'
              }`}
            >
              <div className="order-2 lg:order-1 group">
                <div className="rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card transition-all duration-500 hover:shadow-glow hover:scale-[1.02]">
                  <img 
                    src={step1Image} 
                    alt="Live lecture capture interface showing real-time transcription" 
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
                  <svg className="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-primary uppercase tracking-wider">Step 1</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">Just Teach</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Lecture normally while Edvana listens and transcribes in real-time. No special setup, no interruptions to your teaching flow.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-primary pt-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Real-time transcription active
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div 
              ref={step2Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step2Ref.isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
              }`}
            >
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-secondary-glow flex items-center justify-center shadow-glow-secondary">
                  <Zap className="w-8 h-8 text-secondary-foreground" />
                </div>
                <div className="text-sm font-semibold text-secondary uppercase tracking-wider">Step 2</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">AI Sends Check-Ins</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Smart questions are generated from what you just explained and sent directly to students' devices. They answer without disrupting the lecture.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-secondary pt-2">
                  <Zap className="w-4 h-4 text-secondary" />
                  Contextual questions in seconds
                </div>
              </div>
              <div className="group">
                <div className="rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card transition-all duration-500 hover:shadow-glow-secondary hover:scale-[1.02]">
                  <img 
                    src={step2Image} 
                    alt="Student receiving a live check-in question during lecture" 
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div 
              ref={step3Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step3Ref.isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'
              }`}
            >
              <div className="order-2 lg:order-1 group">
                <div className="rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card transition-all duration-500 hover:shadow-xl hover:scale-[1.02]">
                  <img 
                    src={step3Image} 
                    alt="Analytics dashboard showing student comprehension and performance" 
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-achievement to-achievement-glow flex items-center justify-center shadow-xl">
                  <Users className="w-8 h-8 text-achievement-foreground" />
                </div>
                <div className="text-sm font-semibold text-achievement uppercase tracking-wider">Step 3</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">See Who Gets It</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Get instant visibility into comprehension across your class. Visual analytics show answer distribution and identify struggling students immediately.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-achievement pt-2">
                  <Users className="w-4 h-4 text-achievement" />
                  Real-time class insights
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits - Enhanced with better hover effects */}
      <section 
        ref={benefitsRef.ref}
        className="relative z-10 py-20 px-4 bg-muted/30"
      >
        <div className={`container mx-auto max-w-6xl transition-all duration-1000 ${
          benefitsRef.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Why Instructors Love Edvana
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Powerful features designed for modern education
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "No More Guessing",
                description: "Know exactly who understood and who's lost — without asking",
                icon: "👁️",
                gradient: "from-primary/10 to-primary/5",
                hoverGradient: "hover:from-primary/20 hover:to-primary/10"
              },
              {
                title: "Contextual Questions",
                description: "AI generates check-ins based on your actual lecture content",
                icon: "🧠",
                gradient: "from-secondary/10 to-secondary/5",
                hoverGradient: "hover:from-secondary/20 hover:to-secondary/10"
              },
              {
                title: "Early Intervention",
                description: "Identify struggling students while there's still time to help",
                icon: "⚡",
                gradient: "from-achievement/10 to-achievement/5",
                hoverGradient: "hover:from-achievement/20 hover:to-achievement/10"
              }
            ].map((benefit, i) => (
              <div 
                key={i}
                className={`relative p-8 rounded-3xl bg-gradient-to-br ${benefit.gradient} ${benefit.hoverGradient} border border-border/50 hover:border-primary/30 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl group cursor-pointer`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <span className="text-5xl mb-4 block group-hover:scale-110 transition-transform duration-300">{benefit.icon}</span>
                <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">{benefit.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials - Enhanced */}
      <section 
        ref={testimonialsRef.ref}
        className="relative z-10 py-20 px-4"
      >
        <div className={`container mx-auto max-w-5xl transition-all duration-1000 ${
          testimonialsRef.isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Early Feedback from Educators & Students
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="headspace-card p-8 hover:shadow-xl transition-all duration-300">
              <div className="text-4xl mb-4 text-primary">"</div>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                I demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                  UP
                </div>
                <div>
                  <div className="font-semibold text-foreground">University Professor</div>
                  <div className="text-sm text-muted-foreground">Computer Science</div>
                </div>
              </div>
            </div>

            <div className="headspace-card p-8 md:mt-8 hover:shadow-xl transition-all duration-300">
              <div className="text-4xl mb-4 text-secondary">"</div>
              <p className="text-lg text-foreground leading-relaxed mb-6">
                It was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-secondary to-achievement flex items-center justify-center text-white font-bold">
                  GS
                </div>
                <div>
                  <div className="font-semibold text-foreground">Graduate Student</div>
                  <div className="text-sm text-muted-foreground">Engineering</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Enhanced with 3D effects */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="relative rounded-[2.5rem] p-12 md:p-20 bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground text-center overflow-hidden group hover:shadow-2xl transition-all duration-500">
            {/* Enhanced decorative elements */}
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
              <div className="absolute top-4 left-4 w-24 h-24 rounded-full border-2 border-primary-foreground/30 group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute bottom-8 right-8 w-40 h-40 rounded-full border-2 border-primary-foreground/20 group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute top-1/2 right-1/4 w-6 h-6 rounded-full bg-primary-foreground/30 group-hover:scale-150 transition-transform duration-500" />
              <div className="absolute bottom-1/3 left-1/4 w-4 h-4 rounded-full bg-primary-foreground/40 group-hover:scale-150 transition-transform duration-500" />
            </div>
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Ready to Transform Your Classroom?
              </h2>
              <p className="text-primary-foreground/90 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
                Join thousands of instructors who never wonder if students are following along
              </p>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-10 text-lg h-14 shadow-xl hover:scale-105 transition-all duration-300 group"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <p className="text-primary-foreground/70 text-sm mt-4">
                No credit card required • Free forever for small classes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-4 border-t border-border/50 bg-muted/20">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-2">
              <img src={edvanaLogo} alt="Edvana" className="h-8 mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Transform your classroom with AI-powered engagement and real-time insights.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollToSection('how-it-works')} className="hover:text-foreground transition-colors">How it Works</button></li>
                <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">For Students</button></li>
                <li><button onClick={() => navigate('/instructor/auth')} className="hover:text-foreground transition-colors">For Instructors</button></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => navigate('/privacy')} className="hover:text-foreground transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => navigate('/terms')} className="hover:text-foreground transition-colors">Terms of Service</button></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>&copy; 2025 Edvana. All rights reserved.</span>
            <button 
              onClick={() => navigate('/admin/auth')} 
              className="text-sky-500 hover:text-sky-400 transition-colors font-medium"
            >
              Admin Portal
            </button>
          </div>
        </div>
      </footer>

      {/* Sticky CTA Bar */}
      <StickyCtaBar />
    </div>
  );
};

export default Index;
