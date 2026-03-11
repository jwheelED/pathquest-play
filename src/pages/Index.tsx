import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Users,
  CheckCircle2,
  Shield,
  Mic,
  Square,
  Eye,
  Zap,
  BarChart3,
  X,
  Check,
  Building2,
  FlaskConical,
  Clock,
  MessageSquare,
  GraduationCap,
  HeartPulse,
  Award,
  Monitor,
  Wrench,
  Stethoscope,
} from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnPage = searchParams.get("stay") === "true";

  // Scroll animation refs
  const step1Ref = useScrollAnimation(0.2);
  const step2Ref = useScrollAnimation(0.2);
  const step3Ref = useScrollAnimation(0.2);
  const diffRef = useScrollAnimation(0.2);
  const trustRef = useScrollAnimation(0.2);
  const proofRef = useScrollAnimation(0.2);
  const audienceRef = useScrollAnimation(0.2);

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

  const handleBookDemo = () => {
    window.location.href = "mailto:nigel@edvana.dev?subject=Demo Request&body=I'd like to schedule a demo of Edvana.";
  };

  const handlePilotConversation = () => {
    window.location.href = "mailto:nigel@edvana.dev?subject=Pilot Conversation&body=I'd like to explore a controlled pilot of Edvana for my sessions.";
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* ═══════════════════════════ HEADER ═══════════════════════════ */}
      <header className="relative z-10 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => scrollToSection("hero")}>
            <img src={edvanaLogo} alt="Edvana" className="h-8 transition-transform hover:scale-105" />
          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <button onClick={() => scrollToSection("how-it-works")} className="hover:text-foreground transition-colors">How It Works</button>
            <button onClick={() => scrollToSection("differentiation")} className="hover:text-foreground transition-colors">Why Edvana</button>
            <button onClick={() => scrollToSection("trust")} className="hover:text-foreground transition-colors">Trust</button>
            <button onClick={() => scrollToSection("proof")} className="hover:text-foreground transition-colors">Results</button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/join")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Join Session
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Login
            </button>
            <Button size="sm" onClick={handleBookDemo} className="rounded-full">
              Book a Demo
            </Button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════ HERO ═══════════════════════════ */}
      <section id="hero" className="relative z-10 py-16 md:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-6">
            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.1] tracking-tight animate-fade-in">
              Know Whether the Room Is
              <span className="block mt-2 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                Actually With You
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed animate-fade-in stagger-2">
              Edvana helps instructors, trainers, and facilitators check understanding{" "}
              <span className="text-foreground font-medium">live</span> — without breaking the flow of teaching, training, or explanation.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center animate-fade-in stagger-3">
              <Button
                size="lg"
                onClick={handleBookDemo}
                className="rounded-full px-8 gap-2 shadow-glow hover:shadow-xl transition-all duration-300 hover:scale-105 group"
              >
                Book a Demo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => scrollToSection("how-it-works")}
                className="rounded-full px-8 border-2 border-border text-foreground hover:bg-accent transition-all gap-2"
              >
                See How It Works
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-muted-foreground animate-fade-in stagger-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                No prebuilt polls required
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Review before sending
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Built for real live sessions
              </div>
            </div>
          </div>

          {/* Hero Visual — 3-panel workflow */}
          <div className="mt-14 grid md:grid-cols-3 gap-4 animate-fade-in stagger-4">
            {/* Panel 1: Live session context */}
            <div className="rounded-2xl border border-border bg-card shadow-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Session</span>
              </div>
              <p className="text-sm text-foreground font-medium leading-relaxed">
                "The key difference between Type I and Type II errors is that one rejects a true hypothesis while the other fails to reject a false one…"
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Mic className="w-3 h-3" />
                12 min into session
              </div>
            </div>

            {/* Panel 2: Check-in preview */}
            <div className="rounded-2xl border-2 border-primary/30 bg-card shadow-card p-6">
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-3">Drafted Check-In</p>
              <p className="text-sm text-foreground font-semibold mb-3">A Type II error occurs when you…</p>
              <div className="space-y-2">
                {[
                  { label: "A", text: "Reject a true null hypothesis", correct: false },
                  { label: "B", text: "Fail to reject a false null hypothesis", correct: true },
                  { label: "C", text: "Accept the alternative hypothesis", correct: false },
                ].map((opt) => (
                  <div
                    key={opt.label}
                    className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      opt.correct ? "border border-primary bg-primary/5 font-medium text-foreground" : "border border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      opt.correct ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {opt.label}
                    </span>
                    {opt.text}
                  </div>
                ))}
              </div>
              <Button size="sm" className="w-full mt-3 rounded-full text-xs" style={{ pointerEvents: "none" }}>
                Send to Participants
              </Button>
            </div>

            {/* Panel 3: Response summary */}
            <div className="rounded-2xl border border-border bg-card shadow-card p-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Response Summary</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">A — Reject true null</span>
                    <span className="text-destructive font-medium">31%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-destructive/70 rounded-full" style={{ width: "31%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground font-medium">B — Fail to reject false null ✓</span>
                    <span className="text-primary font-bold">58%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: "58%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">C — Accept alternative</span>
                    <span className="text-muted-foreground font-medium">11%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground/40 rounded-full" style={{ width: "11%" }} />
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  45 responded
                </div>
                <span className="font-semibold text-primary">58% correct</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ AUDIENCE BAND ═══════════════════════════ */}
      <section className="relative z-10 py-10 px-4 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">
            Built for explanation-heavy live sessions like:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: GraduationCap, label: "Higher ed teaching" },
              { icon: Stethoscope, label: "Nursing & clinical education" },
              { icon: Wrench, label: "Workforce training" },
              { icon: Users, label: "Workshops & cohort learning" },
              { icon: Monitor, label: "Zoom & hybrid sessions" },
              { icon: FlaskConical, label: "Technical & case-based instruction" },
            ].map((item, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm text-foreground font-medium"
              >
                <item.icon className="w-4 h-4 text-primary" />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ HOW IT WORKS ═══════════════════════════ */}
      <section id="how-it-works" className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Check understanding during a live session in three simple steps
            </p>
          </div>

          <div className="space-y-16">
            {/* Step 1 — Just Teach */}
            <div
              ref={step1Ref.ref}
              className={`grid lg:grid-cols-2 gap-10 items-center transition-all duration-1000 ${
                step1Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                <div className="rounded-2xl border border-border bg-card shadow-card p-8 md:p-10">
                  <div className="flex flex-col items-center gap-6">
                    <button
                      className={`flex items-center gap-3 px-6 py-3 rounded-full font-semibold text-primary-foreground text-sm transition-all duration-500 ${
                        isRecording ? "bg-destructive shadow-lg scale-105" : "bg-primary shadow-glow"
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

                    <div
                      className={`w-full max-w-sm bg-muted/50 rounded-xl p-5 border border-border transition-all duration-700 ${
                        showTranscript ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 max-h-0 overflow-hidden"
                      }`}
                      style={showTranscript ? { maxHeight: 200 } : { maxHeight: 0 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Transcription</span>
                      </div>
                      <p className="text-base text-foreground font-medium leading-relaxed">
                        "Today we'll cover the three main types of chemical bonds…"
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
                  <Mic className="w-7 h-7 text-primary-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-primary uppercase tracking-wider">Step 1</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">Just Teach</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Lead the session normally while Edvana helps you create live checks for understanding without interrupting flow.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground pt-1">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Real-time session context, without interrupting flow
                </div>
              </div>
            </div>

            {/* Step 2 — Preview and Send a Check-In */}
            <div
              ref={step2Ref.ref}
              className={`grid lg:grid-cols-2 gap-10 items-center transition-all duration-1000 ${
                step2Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
              }`}
            >
              <div className="space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary to-secondary-glow flex items-center justify-center shadow-glow-secondary">
                  <Eye className="w-7 h-7 text-secondary-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-secondary uppercase tracking-wider">Step 2</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">Preview & Send a Check-In</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Edvana drafts a contextual check-in based on what was just explained. You stay in control and review before anything is sent.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground pt-1">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  You review before participants see it
                </div>
              </div>
              <div>
                <div className="rounded-2xl border border-border bg-card shadow-card p-8">
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preview Check-In</p>
                    <p className="text-lg text-foreground font-semibold">What type of bond shares electrons between atoms?</p>
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
                            opt.correct ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                            opt.correct ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            {opt.label}
                          </span>
                          <span className="text-foreground font-medium">{opt.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 — See Where the Room Is Confused */}
            <div
              ref={step3Ref.ref}
              className={`grid lg:grid-cols-2 gap-10 items-center transition-all duration-1000 ${
                step3Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                <div className="rounded-2xl border border-border bg-card shadow-card p-8">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Answer Distribution</p>
                  <p className="text-base text-foreground font-semibold mb-6">What type of bond shares electrons?</p>
                  
                  <div className="flex items-end justify-center gap-3 h-52 mb-4">
                    {[
                      { label: "A", text: "Ionic", count: 5, pct: 23, correct: false, color: "bg-destructive" },
                      { label: "B", text: "Covalent", count: 22, pct: 100, correct: true, color: "bg-primary" },
                      { label: "C", text: "Metallic", count: 3, pct: 14, correct: false, color: "bg-secondary" },
                      { label: "D", text: "Hydrogen", count: 2, pct: 9, correct: false, color: "bg-muted-foreground" },
                    ].map((bar) => (
                      <div key={bar.label} className="flex flex-col items-center gap-1 flex-1 h-full">
                        <span className={`text-base font-extrabold transition-all duration-700 delay-500 ${
                          barsAnimated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                        } text-foreground`}>
                          {bar.count}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all duration-1000 ease-out ${bar.color} ${
                              bar.correct ? "shadow-lg shadow-primary/30" : ""
                            }`}
                            style={{ 
                              height: barsAnimated ? `${bar.pct}%` : "0%",
                              minHeight: barsAnimated ? "8px" : "0px"
                            }}
                          />
                        </div>
                        <div className={`w-full rounded-md py-1.5 text-center text-xs font-bold text-primary-foreground ${bar.color}`}>
                          {bar.label}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium truncate w-full text-center">
                          {bar.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>32 participants responded</span>
                    </div>
                    <span className="font-semibold text-primary">69% correct</span>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-achievement to-achievement-glow flex items-center justify-center shadow-xl">
                  <BarChart3 className="w-7 h-7 text-achievement-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-achievement uppercase tracking-wider">Step 3</div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">See Where the Room Is Confused</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  View live response patterns while the session is still happening, so you can clarify, reframe, or move on with confidence.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground pt-1">
                  <CheckCircle2 className="w-4 h-4 text-achievement" />
                  Act while the session is still live
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ DIFFERENTIATION ═══════════════════════════ */}
      <section id="differentiation" ref={diffRef.ref} className="relative z-10 py-20 px-4 bg-muted/30">
        <div
          className={`max-w-5xl mx-auto transition-all duration-1000 ${
            diffRef.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">Why Edvana Is Different</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-10">
            {/* Traditional */}
            <div className="bg-card rounded-xl shadow-card p-8 border border-border">
              <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Traditional polling tools
              </h3>
              <ul className="space-y-4">
                {[
                  "Require prebuilt questions before the session",
                  "Interrupt flow to launch activities",
                  "Often get used inconsistently or abandoned",
                  "Focus on response collection more than live understanding",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-muted-foreground">
                    <X className="w-4 h-4 text-destructive mt-1 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Edvana */}
            <div className="bg-card rounded-xl shadow-card p-8 border-2 border-primary/30">
              <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                <img src={edvanaLogo} alt="" className="h-5" />
                Edvana
              </h3>
              <ul className="space-y-4">
                {[
                  "Supports in-the-moment checks with minimal prep",
                  "Fits live teaching and training flow",
                  "Lets leaders act while the session is still happening",
                  "Helps surface confusion before it becomes drift",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-foreground">
                    <Check className="w-4 h-4 text-primary mt-1 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Polling tools help collect responses.{" "}
            <span className="text-foreground font-semibold">
              Edvana helps leaders know what the room actually took away while there's still time to adjust.
            </span>
          </p>
        </div>
      </section>

      {/* ═══════════════════════════ TRUST ═══════════════════════════ */}
      <section id="trust" ref={trustRef.ref} className="relative z-10 py-20 px-4">
        <div
          className={`max-w-4xl mx-auto transition-all duration-1000 ${
            trustRef.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Built for Trust, Control, and Real-World Rollout
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: Shield,
                title: "Leader-controlled workflow",
                desc: "Every check-in is reviewed before it is sent.",
              },
              {
                icon: Building2,
                title: "Built for privacy-sensitive environments",
                desc: "Designed for settings where trust, discretion, and responsible data handling matter.",
              },
              {
                icon: FlaskConical,
                title: "Easy to pilot",
                desc: "Start small with a controlled rollout before expanding.",
              },
              {
                icon: Zap,
                title: "Low setup burden",
                desc: "No heavy setup or complex integration required.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-card rounded-xl border border-border shadow-card p-6 flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ PROOF ═══════════════════════════ */}
      <section id="proof" ref={proofRef.ref} className="relative z-10 py-20 px-4 bg-muted/30">
        <div
          className={`max-w-6xl mx-auto transition-all duration-1000 ${
            proofRef.isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Used in Real Teaching and Training Environments
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                environment: "Higher Education",
                context: "Intro to Writing",
                sessions: 12,
                responseRate: 78,
                repeatUse: "4 of 5 class sessions",
                role: "University Professor",
                quote: "I demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.",
              },
              {
                environment: "STEM Instruction",
                context: "Engineering Fundamentals",
                sessions: 8,
                responseRate: 85,
                repeatUse: "Every session after week 2",
                role: "Instructor",
                quote: "I stopped guessing and started knowing which concepts needed more time.",
              },
              {
                environment: "Graduate Seminar",
                context: "Computer Science Seminar",
                sessions: 15,
                responseRate: 72,
                repeatUse: "3 of 4 class sessions",
                role: "Graduate Engineering Student",
                quote: "It was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!",
              },
            ].map((card, i) => (
              <div key={i} className="bg-card rounded-xl border border-border shadow-card p-8 flex flex-col">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">{card.environment}</div>
                <div className="flex items-center gap-2 mb-5">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{card.context}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-foreground">{card.sessions}</div>
                    <div className="text-xs text-muted-foreground mt-1">Sessions</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-primary">{card.responseRate}%</div>
                    <div className="text-xs text-muted-foreground mt-1">Avg. Response</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  Repeat use: {card.repeatUse}
                </div>
                <div className="mt-auto pt-5 border-t border-border">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mb-2" />
                  <p className="text-sm text-foreground italic leading-relaxed">"{card.quote}"</p>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">— {card.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ WHO IT IS FOR ═══════════════════════════ */}
      <section
        id="audience"
        ref={audienceRef.ref}
        className="relative z-10 py-20 px-4"
      >
        <div
          className={`max-w-5xl mx-auto transition-all duration-1000 ${
            audienceRef.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Who Edvana Is For
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: GraduationCap,
                title: "Higher education",
                desc: "For instructors teaching difficult or explanation-heavy material.",
              },
              {
                icon: HeartPulse,
                title: "Clinical & health-professions education",
                desc: "For nursing, medical, PA, and case-based learning environments.",
              },
              {
                icon: Award,
                title: "Training & certification",
                desc: "For trainers who need live signal without heavy prep.",
              },
              {
                icon: Users,
                title: "Workshops & cohort-based sessions",
                desc: "For facilitators leading high-attention learning experiences.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-card rounded-xl border border-border shadow-card p-8 flex gap-5">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ FINAL CTA ═══════════════════════════ */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-[2.5rem] p-12 md:p-20 bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground text-center overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">See How Edvana Fits Your Live Sessions</h2>
              <p className="text-primary-foreground/90 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
                Start with a short demo or controlled pilot to see how Edvana supports real-time understanding in teaching, training, and explanation-heavy sessions.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={handleBookDemo}
                  className="rounded-full px-10 text-lg h-14 shadow-xl hover:scale-105 transition-all duration-300 group bg-card text-primary hover:bg-accent border-none"
                >
                  Book a Demo
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handlePilotConversation}
                  className="rounded-full px-10 text-lg h-14 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 transition-all"
                >
                  Start a Pilot Conversation
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ FOOTER ═══════════════════════════ */}
      <footer className="relative z-10 py-12 px-4 border-t border-border bg-muted/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-8">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button onClick={() => scrollToSection("how-it-works")} className="hover:text-foreground hover:underline transition-colors">
                    How It Works
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("differentiation")} className="hover:text-foreground hover:underline transition-colors">
                    Why Edvana
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("audience")} className="hover:text-foreground hover:underline transition-colors">
                    Who It's For
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Trust</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button onClick={() => scrollToSection("trust")} className="hover:text-foreground hover:underline transition-colors">
                    Trust & Control
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("proof")} className="hover:text-foreground hover:underline transition-colors">
                    Results
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Login & Join Session</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button onClick={() => navigate("/auth")} className="hover:text-foreground hover:underline transition-colors">
                    Login
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/join")} className="hover:text-foreground hover:underline transition-colors">
                    Join Session
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/admin/auth")} className="hover:text-foreground hover:underline transition-colors">
                    Admin Portal
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button onClick={() => navigate("/privacy")} className="hover:text-foreground hover:underline transition-colors">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/terms")} className="hover:text-foreground hover:underline transition-colors">
                    Terms of Service
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <img src={edvanaLogo} alt="Edvana" className="h-7" />
            <p className="text-sm text-muted-foreground italic">Live understanding without breaking flow.</p>
            <span className="text-sm text-muted-foreground">&copy; 2026 Edvana. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
