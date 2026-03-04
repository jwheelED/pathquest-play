import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Users, Zap, CheckCircle2, Shield, BookOpen, Mic, Square, Eye, Brain, BarChart3 } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnPage = searchParams.get("stay") === "true";

  // Scroll animation refs for each section
  const step1Ref = useScrollAnimation(0.2);
  const step2Ref = useScrollAnimation(0.2);
  const step3Ref = useScrollAnimation(0.2);
  const benefitsRef = useScrollAnimation(0.2);
  const testimonialsRef = useScrollAnimation(0.2);

  // Step 1 recording animation state
  const [isRecording, setIsRecording] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const recordingTriggered = useRef(false);

  useEffect(() => {
    if (step1Ref.isVisible && !recordingTriggered.current) {
      recordingTriggered.current = true;
      const t1 = setTimeout(() => setIsRecording(true), 1500);
      const t2 = setTimeout(() => setShowTranscript(true), 2200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [step1Ref.isVisible]);

  // Step 3 bar chart animation state
  const [barsAnimated, setBarsAnimated] = useState(false);
  const barsTriggered = useRef(false);

  useEffect(() => {
    if (step3Ref.isVisible && !barsTriggered.current) {
      barsTriggered.current = true;
      const t = setTimeout(() => setBarsAnimated(true), 400);
      return () => clearTimeout(t);
    }
  }, [step3Ref.isVisible]);

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

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Header — solid border, high-contrast links */}
      <header className="relative z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => scrollToSection("hero")}>
            <img src={edvanaLogo} alt="Edvana" className="h-8 transition-transform hover:scale-105" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/join")}
              className="text-slate-700 hover:text-slate-900 hover:underline"
            >
              Join Session
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/auth")}
              className="rounded-full border-2 border-slate-700 text-slate-700 hover:bg-slate-700 hover:text-white transition-all"
            >
              Student Login
            </Button>
            <Button size="sm" onClick={() => navigate("/instructor/auth")} className="rounded-full hidden md:flex">
              Instructor Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" className="relative z-10 py-16 md:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-fade-in border border-primary/20">
              <Sparkles className="w-4 h-4" />
              Smart Engagement Platform
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-text-main leading-[1.1] tracking-tight animate-fade-in">
              Know Who's
              <span className="block mt-2 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                Actually Learning
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-lg md:text-xl text-text-muted-landing max-w-2xl mx-auto leading-relaxed animate-fade-in stagger-2">
              The fastest way to check understanding <span className="text-text-main font-medium">live</span> without
              breaking lecture flow.
            </p>

            {/* CTAs */}
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
                className="rounded-full px-8 border-2 border-slate-700 text-slate-700 hover:bg-slate-700 hover:text-white transition-all gap-2"
              >
                <BookOpen className="w-4 h-4" />
                For Students
              </Button>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-text-muted-landing animate-fade-in stagger-4">
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
                Secure &amp; Private
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">
              Engagement Made <span className="text-primary">Effortless</span>
            </h2>
            <p className="text-text-muted-landing text-lg max-w-2xl mx-auto">
              Three simple steps to transform passive lectures into active learning
            </p>
          </div>

          <div className="space-y-24">
            {/* Step 1 */}
            <div
              ref={step1Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step1Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                {/* Stylized mockup — Recording animation */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8 md:p-12">
                  <div className="flex flex-col items-center gap-6">
                    {/* Start/Stop Recording Button */}
                    <button
                      className={`flex items-center gap-3 px-6 py-3 rounded-full font-semibold text-white text-sm transition-all duration-500 ${
                        isRecording
                          ? "bg-destructive shadow-lg scale-105"
                          : "bg-primary shadow-glow"
                      }`}
                      style={{ pointerEvents: "none" }}
                    >
                      {isRecording ? (
                        <>
                          <Square className="w-4 h-4" fill="currentColor" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          Start Recording
                        </>
                      )}
                    </button>

                    {/* Transcription bubble — fades in */}
                    <div
                      className={`w-full max-w-sm bg-slate-50 rounded-xl p-5 border border-slate-100 transition-all duration-700 ${
                        showTranscript ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 max-h-0 overflow-hidden"
                      }`}
                      style={showTranscript ? { maxHeight: 200 } : { maxHeight: 0 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-xs font-medium text-text-muted-landing uppercase tracking-wider">Live Transcription</span>
                      </div>
                      <p className="text-lg text-text-main font-medium leading-relaxed">
                        "Today we'll cover the three main types of chemical bonds…"
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
                  <Mic className="w-8 h-8 text-primary-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-primary uppercase tracking-wider">Step 1</div>
                <h3 className="text-3xl md:text-4xl font-bold text-text-main">Just Teach</h3>
                <p className="text-lg text-text-muted-landing leading-relaxed">
                  Lecture normally while Edvana listens and transcribes in real-time. No special setup, no interruptions
                  to your teaching flow.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Real-time transcription active
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div
              ref={step2Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step2Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
              }`}
            >
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-secondary-glow flex items-center justify-center shadow-glow-secondary">
                  <Zap className="w-8 h-8 text-secondary-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-secondary uppercase tracking-wider">Step 2</div>
                <h3 className="text-3xl md:text-4xl font-bold text-text-main">AI Sends Check-Ins</h3>
                <p className="text-lg text-text-muted-landing leading-relaxed">
                  Smart questions are generated from what you just explained and sent directly to students' devices.
                  They answer without disrupting the lecture.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  Contextual questions in seconds
                </div>
              </div>
              <div>
                {/* Stylized mockup — MCQ card */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8">
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-text-muted-landing uppercase tracking-wider">Check-In Question</p>
                    <p className="text-lg text-text-main font-semibold">What type of bond shares electrons between atoms?</p>
                    <div className="space-y-3 pt-2">
                      {[
                        { label: "A", text: "Ionic bond", correct: false },
                        { label: "B", text: "Covalent bond", correct: true },
                        { label: "C", text: "Metallic bond", correct: false },
                        { label: "D", text: "Hydrogen bond", correct: false },
                      ].map((opt) => (
                        <div
                          key={opt.label}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            opt.correct ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                            opt.correct ? "bg-primary text-white" : "bg-slate-200 text-text-muted-landing"
                          }`}>
                            {opt.label}
                          </span>
                          <span className="text-text-main font-medium">{opt.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div
              ref={step3Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step3Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                {/* Stylized mockup — Kahoot-style vertical bar chart */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8">
                  <p className="text-sm font-medium text-text-muted-landing uppercase tracking-wider mb-2">Answer Distribution</p>
                  <p className="text-base text-text-main font-semibold mb-6">What type of bond shares electrons?</p>
                  
                  {/* Vertical bars */}
                  <div className="flex items-end justify-center gap-4 h-48 mb-4">
                    {[
                      { label: "A", count: 5, pct: 16, correct: false },
                      { label: "B", count: 22, pct: 69, correct: true },
                      { label: "C", count: 3, pct: 9, correct: false },
                      { label: "D", count: 2, pct: 6, correct: false },
                    ].map((bar) => (
                      <div key={bar.label} className="flex flex-col items-center gap-2 flex-1">
                        {/* Count label */}
                        <span className={`text-sm font-bold transition-all duration-700 ${
                          barsAnimated ? "opacity-100" : "opacity-0"
                        } ${bar.correct ? "text-primary" : "text-text-muted-landing"}`}>
                          {bar.count}
                        </span>
                        {/* Bar */}
                        <div className="w-full max-w-[60px] bg-slate-100 rounded-t-lg overflow-hidden relative" style={{ height: "100%" }}>
                          <div
                            className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-1000 ease-out ${
                              bar.correct ? "bg-primary" : "bg-destructive/70"
                            }`}
                            style={{ height: barsAnimated ? `${bar.pct}%` : "0%" }}
                          />
                        </div>
                        {/* Label */}
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          bar.correct
                            ? "bg-primary/10 text-primary"
                            : "bg-slate-100 text-text-muted-landing"
                        }`}>
                          {bar.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-sm text-text-muted-landing">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>32 students responded</span>
                    </div>
                    <span className="font-semibold text-primary">69% correct</span>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-achievement to-achievement-glow flex items-center justify-center shadow-xl">
                  <BarChart3 className="w-8 h-8 text-achievement-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-achievement uppercase tracking-wider">Step 3</div>
                <h3 className="text-3xl md:text-4xl font-bold text-text-main">See Who Gets It</h3>
                <p className="text-lg text-text-muted-landing leading-relaxed">
                  Get instant visibility into comprehension across your class. Visual analytics show answer distribution
                  and identify struggling students immediately.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-achievement" />
                  Real-time class insights
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section ref={benefitsRef.ref} className="relative z-10 py-20 px-4 bg-slate-50/50">
        <div
          className={`max-w-6xl mx-auto transition-all duration-1000 ${
            benefitsRef.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">Why Instructors Love Edvana</h2>
            <p className="text-text-muted-landing text-lg max-w-2xl mx-auto">
              Powerful features designed for modern education
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "No More Guessing",
                description: "Know exactly who understood and who's lost — without asking",
                Icon: Eye,
              },
              {
                title: "Contextual Questions",
                description: "AI generates check-ins based on your actual lecture content",
                Icon: Brain,
              },
              {
                title: "Early Intervention",
                description: "Identify struggling students while there's still time to help",
                Icon: Zap,
              },
            ].map((benefit, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-card p-6 border border-slate-200 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <benefit.Icon className="w-6 h-6 text-text-main" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-3">
                  {benefit.title}
                </h3>
                <p className="text-text-muted-landing leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section ref={testimonialsRef.ref} className="relative z-10 py-20 px-4">
        <div
          className={`max-w-4xl mx-auto transition-all duration-1000 ${
            testimonialsRef.isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">
              Early Feedback from Educators &amp; Students
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl shadow-card p-8 border border-slate-200">
              <div className="text-4xl mb-4 text-primary">"</div>
              <p className="text-lg text-text-main leading-relaxed mb-6">
                I demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students
                are following along.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-text-muted-landing font-semibold text-sm">
                  UP
                </div>
                <div>
                  <div className="font-semibold text-text-main">University Professor</div>
                  <div className="text-sm text-text-muted-landing">Computer Science</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-card p-8 border border-slate-200">
              <div className="text-4xl mb-4 text-secondary">"</div>
              <p className="text-lg text-text-main leading-relaxed mb-6">
                It was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-text-muted-landing font-semibold text-sm">
                  GS
                </div>
                <div>
                  <div className="font-semibold text-text-main">Graduate Student</div>
                  <div className="text-sm text-text-muted-landing">Engineering</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-[2.5rem] p-12 md:p-20 bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground text-center overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to Transform Your Classroom?</h2>
              <p className="text-primary-foreground/90 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
                Join thousands of instructors who never wonder if students are following along
              </p>
              <Button
                size="lg"
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-10 text-lg h-14 shadow-xl hover:scale-105 transition-all duration-300 group bg-white text-emerald-700 hover:bg-emerald-50 border-none"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <p className="text-sm text-white/85 mt-4">
                No credit card required • Free forever for small classes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-4 border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-8">
            {/* Brand */}
            <div className="col-span-2">
              <img src={edvanaLogo} alt="Edvana" className="h-8 mb-4" />
              <p className="text-sm text-text-muted-landing mb-4">
                Transform your classroom with AI-powered engagement and real-time insights.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold text-text-main mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-text-muted-landing">
                <li>
                  <button
                    onClick={() => scrollToSection("how-it-works")}
                    className="hover:text-slate-900 hover:underline transition-colors"
                  >
                    How it Works
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/auth")} className="hover:text-slate-900 hover:underline transition-colors">
                    For Students
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/instructor/auth")}
                    className="hover:text-slate-900 hover:underline transition-colors"
                  >
                    For Instructors
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/admin/auth")}
                    className="hover:text-slate-900 hover:underline transition-colors"
                  >
                    Admin Portal
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="font-semibold text-text-main mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-text-muted-landing">
                <li>
                  <button onClick={() => navigate("/privacy")} className="hover:text-slate-900 hover:underline transition-colors">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/terms")} className="hover:text-slate-900 hover:underline transition-colors">
                    Terms of Service
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-slate-200 text-sm text-text-subtle text-center">
            <span>&copy; 2025 Edvana. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
