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

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Header */}
      <header className="relative z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0">
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
              Student Login
            </button>
            <button
              onClick={() => navigate("/instructor/auth")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Instructor Login
            </button>
            <Button size="sm" onClick={handleBookDemo} className="rounded-full">
              Book a Demo
            </Button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════ HERO ═══════════════════════════ */}
      <section id="hero" className="relative z-10 py-16 md:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-fade-in border border-primary/20">
              <Clock className="w-4 h-4" />
              Live understanding, without poll-building friction
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-text-main leading-[1.1] tracking-tight animate-fade-in">
              Know Who's
              <span className="block mt-2 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                Actually Learning
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-text-muted-landing max-w-2xl mx-auto leading-relaxed animate-fade-in stagger-2">
              Edvana helps instructors check understanding <span className="text-text-main font-medium">live</span> without breaking lecture flow.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center animate-fade-in stagger-3">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="rounded-full px-8 gap-2 shadow-glow hover:shadow-xl transition-all duration-300 hover:scale-105 group"
              >
                Student Login
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-8 border-2 border-slate-300 text-text-main hover:bg-slate-100 transition-all gap-2"
              >
                Instructor Login
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Trust strip */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-text-muted-landing animate-fade-in stagger-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Instructor-controlled
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Built for privacy-sensitive environments
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Designed for real lectures
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ HOW IT WORKS ═══════════════════════════ */}
      <section id="how-it-works" className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">
              How It Works
            </h2>
            <p className="text-text-muted-landing text-lg max-w-2xl mx-auto">
              Check understanding during a live lecture in three simple steps
            </p>
          </div>

          <div className="space-y-24">
            {/* Step 1 — Just Teach */}
            <div
              ref={step1Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step1Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8 md:p-12">
                  <div className="flex flex-col items-center gap-6">
                    <button
                      className={`flex items-center gap-3 px-6 py-3 rounded-full font-semibold text-white text-sm transition-all duration-500 ${
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
                  Lecture normally while Edvana listens to the flow of the session and helps you create live checks for understanding.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Real-time transcription active
                </div>
              </div>
            </div>

            {/* Step 2 — Preview and Send a Check-In */}
            <div
              ref={step2Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step2Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
              }`}
            >
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-secondary-glow flex items-center justify-center shadow-glow-secondary">
                  <Eye className="w-8 h-8 text-secondary-foreground" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-semibold text-secondary uppercase tracking-wider">Step 2</div>
                <h3 className="text-3xl md:text-4xl font-bold text-text-main">Preview & Send a Check-In</h3>
                <p className="text-lg text-text-muted-landing leading-relaxed">
                  Edvana helps draft a contextual check-in based on what was just taught. The instructor stays in control and decides what gets sent.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  You review before students see it
                </div>
              </div>
              <div>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8">
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-text-muted-landing uppercase tracking-wider">Preview Check-In</p>
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

            {/* Step 3 — See Where the Room Is Confused */}
            <div
              ref={step3Ref.ref}
              className={`grid lg:grid-cols-2 gap-12 items-center transition-all duration-1000 ${
                step3Ref.isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              <div className="order-2 lg:order-1">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-card p-8">
                  <p className="text-sm font-medium text-text-muted-landing uppercase tracking-wider mb-2">Answer Distribution</p>
                  <p className="text-base text-text-main font-semibold mb-6">What type of bond shares electrons?</p>
                  
                  <div className="flex items-end justify-center gap-3 h-52 mb-4">
                    {[
                      { label: "A", text: "Ionic", count: 5, pct: 23, correct: false, color: "bg-red-500" },
                      { label: "B", text: "Covalent", count: 22, pct: 100, correct: true, color: "bg-emerald-500" },
                      { label: "C", text: "Metallic", count: 3, pct: 14, correct: false, color: "bg-orange-500" },
                      { label: "D", text: "Hydrogen", count: 2, pct: 9, correct: false, color: "bg-blue-500" },
                    ].map((bar) => (
                      <div key={bar.label} className="flex flex-col items-center gap-1 flex-1 h-full">
                        <span className={`text-base font-extrabold transition-all duration-700 delay-500 ${
                          barsAnimated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                        } text-text-main`}>
                          {bar.count}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all duration-1000 ease-out ${bar.color} ${
                              bar.correct ? "shadow-lg shadow-emerald-500/30" : ""
                            }`}
                            style={{ 
                              height: barsAnimated ? `${bar.pct}%` : "0%",
                              minHeight: barsAnimated ? "8px" : "0px"
                            }}
                          />
                        </div>
                        <div className={`w-full rounded-md py-1.5 text-center text-xs font-bold text-white ${bar.color}`}>
                          {bar.label}
                        </div>
                        <span className="text-xs text-text-muted-landing font-medium truncate w-full text-center">
                          {bar.text}
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
                <h3 className="text-3xl md:text-4xl font-bold text-text-main">See Where the Room Is Confused</h3>
                <p className="text-lg text-text-muted-landing leading-relaxed">
                  View live response patterns while the lecture is still happening, so you can clarify, re-vote, or move on with confidence.
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-text-main pt-2">
                  <CheckCircle2 className="w-4 h-4 text-achievement" />
                  Act while the session is still live
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ DIFFERENTIATION ═══════════════════════════ */}
      <section id="differentiation" ref={diffRef.ref} className="relative z-10 py-20 px-4 bg-slate-50/50">
        <div
          className={`max-w-5xl mx-auto transition-all duration-1000 ${
            diffRef.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">Why Edvana Is Different</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Traditional */}
            <div className="bg-white rounded-xl shadow-card p-8 border border-slate-200">
              <h3 className="text-lg font-bold text-text-main mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Traditional polling tools
              </h3>
              <ul className="space-y-4">
                {[
                  "Require prebuilt questions before every class",
                  "Interrupt lecture flow to launch polls",
                  "Often used inconsistently or abandoned",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-text-muted-landing">
                    <X className="w-4 h-4 text-destructive mt-1 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Edvana */}
            <div className="bg-white rounded-xl shadow-card p-8 border-2 border-primary/30">
              <h3 className="text-lg font-bold text-text-main mb-6 flex items-center gap-2">
                <img src={edvanaLogo} alt="" className="h-5" />
                Edvana
              </h3>
              <ul className="space-y-4">
                {[
                  "Supports in-the-moment checks — no prep required",
                  "Fits real lecture flow without breaking it",
                  "Helps instructors act while the session is still live",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-text-main">
                    <Check className="w-4 h-4 text-primary mt-1 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-lg text-text-muted-landing max-w-3xl mx-auto leading-relaxed">
            Polling tools help collect responses.{" "}
            <span className="text-text-main font-semibold">
              Edvana helps instructors check understanding while there is still time to adjust.
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
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">
              Built for Trust, Control, and Real-World Rollout
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: Shield,
                title: "Instructor-controlled workflow",
                desc: "Every check-in is reviewed and approved by the instructor before students see it.",
              },
              {
                icon: Building2,
                title: "Built for FERPA-sensitive environments",
                desc: "Designed with institutional data privacy requirements in mind from day one.",
              },
              {
                icon: FlaskConical,
                title: "Designed for controlled pilots",
                desc: "Start with a single section or course before broader rollout — no all-or-nothing commitment.",
              },
              {
                icon: Zap,
                title: "Fits real classes without heavy setup",
                desc: "No LMS integration required to get started. Works in any classroom with a browser.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-card p-6 flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-text-main mb-1">{item.title}</h3>
                  <p className="text-sm text-text-muted-landing leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ PROOF ═══════════════════════════ */}
      <section id="proof" ref={proofRef.ref} className="relative z-10 py-20 px-4 bg-slate-50/50">
        <div
          className={`max-w-6xl mx-auto transition-all duration-1000 ${
            proofRef.isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-main mb-4">
              Used in Real Learning Environments
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                context: "Intro to Writing",
                sessions: 12,
                responseRate: 78,
                repeatUse: "4 of 5 class sessions",
                role: "University Professor",
                quote: "I demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.",
              },
              {
                context: "Engineering Fundamentals",
                sessions: 8,
                responseRate: 85,
                repeatUse: "Every session after week 2",
                role: "Instructor",
                quote: "I stopped guessing and started knowing which concepts needed more time.",
              },
              {
                context: "Computer Science Seminar",
                sessions: 15,
                responseRate: 72,
                repeatUse: "3 of 4 class sessions",
                role: "Graduate Engineering Student",
                quote: "It was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!",
              },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-card p-6 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">{card.context}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-text-main">{card.sessions}</div>
                    <div className="text-xs text-text-muted-landing">Sessions</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{card.responseRate}%</div>
                    <div className="text-xs text-text-muted-landing">Avg. Response</div>
                  </div>
                </div>
                <div className="text-xs text-text-muted-landing mb-4 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  Repeat use: {card.repeatUse}
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mb-2" />
                  <p className="text-sm text-text-main italic leading-relaxed">"{card.quote}"</p>
                  {card.role && <p className="text-xs text-text-muted-landing mt-2 font-medium">— {card.role}</p>}
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
              <h2 className="text-3xl md:text-5xl font-bold mb-6">See How Edvana Fits a Live Class</h2>
              <p className="text-primary-foreground/90 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
                Start with a controlled pilot or a short demo to evaluate real classroom fit.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={handleBookDemo}
                  className="rounded-full px-10 text-lg h-14 shadow-xl hover:scale-105 transition-all duration-300 group bg-white text-emerald-700 hover:bg-emerald-50 border-none"
                >
                  Book a Demo
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleBookDemo}
                  className="rounded-full px-10 text-lg h-14 border-2 border-white/40 text-primary hover:bg-white/10 hover:text-primary transition-all"
                >
                  Start a Pilot Conversation
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ FOOTER ═══════════════════════════ */}
      <footer className="relative z-10 py-12 px-4 border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-8">
            <div className="col-span-2">
              <img src={edvanaLogo} alt="Edvana" className="h-8 mb-4" />
              <p className="text-sm text-text-muted-landing mb-4">
                Check understanding live without breaking lecture flow.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-text-main mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-text-muted-landing">
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
                  <button onClick={() => scrollToSection("trust")} className="hover:text-foreground hover:underline transition-colors">
                    Trust
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/instructor/auth")} className="hover:text-foreground hover:underline transition-colors">
                    Instructor Login
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
              <h3 className="font-semibold text-text-main mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-text-muted-landing">
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

          <div className="pt-8 border-t border-slate-200 text-sm text-text-subtle text-center">
            <span>&copy; 2026 Edvana. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
