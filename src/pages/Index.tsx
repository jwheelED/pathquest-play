import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Menu, X, ChevronDown } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const NAV_ITEMS = ["Product", "How It Works", "Use Cases", "Results", "Demo"];

const Index = () => {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayOnPage = searchParams.get("stay") === "true";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkSessionAndRedirect = async (session: unknown) => {
      if (session && !stayOnPage) {
        const typedSession = session as { user: { id: string } };

        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", typedSession.user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminRole) {
          navigate("/admin/dashboard");
          return;
        }

        const { data: instructorRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", typedSession.user.id)
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const [corpDropdownOpen, setCorpDropdownOpen] = useState(false);
  const corpDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (corpDropdownRef.current && !corpDropdownRef.current.contains(e.target as Node)) {
        setCorpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleBookDemo = () => {
    window.location.href =
      "mailto:nigel@edvana.dev?subject=Demo Request&body=I'd like to schedule a demo of Edvana.";
  };

  const handleStartPilot = () => {
    window.location.href =
      "mailto:nigel@edvana.dev?subject=Pilot Conversation&body=I'd like to set up a pilot.";
  };

  const handleContact = () => {
    window.location.href =
      "mailto:nigel@edvana.dev?subject=Contact&body=";
  };

  return (
    <div className="landing-page min-h-screen">
      {/* ═══════════ HEADER ═══════════ */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{
          backgroundColor: "hsl(var(--landing-bg) / 0.85)",
          borderBottom: "1px solid hsl(var(--landing-border))",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-[60px] flex items-center justify-between">
          {/* Left — Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer shrink-0"
            onClick={() => scrollToSection("hero")}
          >
            <img
              src={edvanaLogo}
              alt="Edvana"
              className="h-7 transition-transform hover:scale-105"
            />
          </div>

          {/* Center — Nav (desktop) */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item, i) => (
              <span key={item} className="flex items-center">
                {i > 0 && (
                  <span
                    className="mx-3 w-[3px] h-[3px] rounded-full"
                    style={{ backgroundColor: "hsl(var(--landing-border))" }}
                  />
                )}
                <button
                  onClick={() =>
                    scrollToSection(item.toLowerCase().replace(/\s+/g, "-"))
                  }
                  className="landing-nav-link"
                >
                  {item}
                </button>
              </span>
            ))}
          </nav>

          {/* Right — Utility (desktop) */}
          <div className="hidden lg:flex items-center gap-5 shrink-0">
            <button
              onClick={handleBookDemo}
              className="landing-util-link"
            >
              Book a Demo
            </button>
            <button
              onClick={handleStartPilot}
              className="landing-util-link"
            >
              Book a Pilot
            </button>
            {/* Corporate dropdown */}
            <div className="relative" ref={corpDropdownRef}>
              <button
                onClick={() => setCorpDropdownOpen(!corpDropdownOpen)}
                className="landing-util-link flex items-center gap-1"
              >
                Corporate
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {corpDropdownOpen && (
                <div
                  className="absolute top-full right-0 mt-2 w-44 rounded-lg py-1 shadow-lg"
                  style={{
                    backgroundColor: "hsl(var(--landing-bg))",
                    border: "1px solid hsl(var(--landing-border))",
                  }}
                >
                  <button
                    onClick={() => { navigate("/corporate/events"); setCorpDropdownOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-[13px] transition-colors hover:opacity-80"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    Events
                  </button>
                  <button
                    onClick={() => { navigate("/corporate/enterprise"); setCorpDropdownOpen(false); }}
                    className="block w-full text-left px-4 py-2 text-[13px] transition-colors hover:opacity-80"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    Enterprise
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate("/join")}
              className="landing-cta"
            >
              Join Session
            </button>
          </div>

          {/* Mobile — CTA + Hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            <button onClick={() => navigate("/join")} className="landing-cta text-xs px-4 py-2">
              Join Session
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "hsl(var(--landing-text))" }}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden px-6 py-4 space-y-1"
            style={{
              backgroundColor: "hsl(var(--landing-surface))",
              borderTop: "1px solid hsl(var(--landing-border))",
            }}
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => {
                  scrollToSection(item.toLowerCase().replace(/\s+/g, "-"));
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-2.5 landing-nav-link"
              >
                {item}
              </button>
            ))}
            <div className="pt-3 flex flex-col gap-2" style={{ borderTop: "1px solid hsl(var(--landing-border))" }}>
              <button onClick={handleBookDemo} className="landing-util-link text-left py-2">Book a Demo</button>
              <button onClick={handleStartPilot} className="landing-util-link text-left py-2">Book a Pilot</button>
              <button onClick={() => { navigate("/corporate/events"); setMobileMenuOpen(false); }} className="landing-util-link text-left py-2">Corporate Events</button>
              <button onClick={() => { navigate("/corporate/enterprise"); setMobileMenuOpen(false); }} className="landing-util-link text-left py-2">Corporate Enterprise</button>
              <button onClick={() => navigate("/join")} className="landing-util-link text-left py-2">Join Session</button>
            </div>
          </div>
        )}
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <main>
        <section id="hero" className="relative pt-28 pb-24 md:pt-36 md:pb-32 px-6">
          <div className="max-w-[1120px] mx-auto">
            {/* Text block */}
            <div className="max-w-2xl mx-auto text-center">
              {/* Eyebrow */}
              <p className="landing-eyebrow mb-5">
                Live understanding, in real time
              </p>

              {/* Headline */}
              <h1
                className="text-4xl md:text-[52px] lg:text-[60px] font-bold leading-[1.08] tracking-[-0.025em] mb-6"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                See understanding while you speak.
              </h1>

              {/* Subheadline */}
              <p
                className="text-lg md:text-xl leading-relaxed mb-11 max-w-lg mx-auto"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                Edvana helps speakers turn live questions into instant audience
                understanding checks, so they can adjust in real time without
                breaking flow.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-9">
                <button onClick={() => navigate("/instructor/auth")} className="landing-cta px-8 py-3 text-[15px]">
                  Instructor Sign In
                </button>
                <button
                  onClick={() => navigate("/auth")}
                  className="landing-secondary-btn px-8 py-3 text-[15px]"
                >
                  Student Sign In
                </button>
              </div>

              {/* Proof points */}
              <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px]" style={{ color: "hsl(var(--landing-muted))" }}>
                {["No prebuilt polls required", "Review before sending", "Built for real live sessions"].map((point) => (
                  <span key={point} className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "hsl(var(--landing-accent))" }}
                    />
                    {point}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Hero Visual: Continuous product story ── */}
            <div className="mt-18 md:mt-24 max-w-4xl mx-auto">
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  border: "1px solid hsl(var(--landing-border))",
                  backgroundColor: "hsl(var(--landing-surface))",
                  boxShadow: "0 24px 80px -12px hsl(220 20% 12% / 0.08), 0 0 0 1px hsl(220 10% 92% / 0.4)",
                }}
              >
                {/* Flow steps bar */}
                <div
                  className="flex items-center gap-0 text-[11px] font-medium"
                  style={{ borderBottom: "1px solid hsl(var(--landing-border))" }}
                >
                  {[
                    { num: "1", label: "Speaker is live" },
                    { num: "2", label: "Edvana drafts a check-in" },
                    { num: "3", label: "Sent to audience" },
                    { num: "4", label: "Signal appears" },
                  ].map((step, i) => (
                    <div
                      key={step.num}
                      className="flex-1 flex items-center gap-2 px-4 py-3"
                      style={{
                        borderRight: i < 3 ? "1px solid hsl(var(--landing-border))" : "none",
                        color: i === 3 ? "hsl(var(--landing-accent))" : "hsl(var(--landing-muted))",
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          backgroundColor: i === 3 ? "hsl(var(--landing-accent) / 0.1)" : "hsl(var(--landing-border))",
                          color: i === 3 ? "hsl(var(--landing-accent))" : "hsl(var(--landing-muted))",
                        }}
                      >
                        {step.num}
                      </span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                  ))}
                </div>

                {/* Product scene */}
                <div className="grid md:grid-cols-[1fr_1px_1.1fr_1px_0.8fr] min-h-[280px]">
                  {/* Panel 1: Live transcript */}
                  <div className="p-6 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "hsl(0 72% 55%)" }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--landing-muted))" }}>
                        Live
                      </span>
                      <span className="text-[11px] ml-auto" style={{ color: "hsl(var(--landing-border))" }}>
                        14:22
                      </span>
                    </div>
                    <p className="text-[14px] leading-relaxed" style={{ color: "hsl(var(--landing-text))" }}>
                      "The key difference between Type I and Type II errors is that one rejects a true hypothesis
                      while the other fails to reject a false one…"
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      {[0.6, 1, 0.7, 0.9, 0.5, 0.8, 1, 0.6].map((h, i) => (
                        <span
                          key={i}
                          className="w-[3px] rounded-full"
                          style={{
                            height: `${h * 16}px`,
                            backgroundColor: "hsl(var(--landing-accent) / 0.3)",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block" style={{ backgroundColor: "hsl(var(--landing-border))" }} />

                  {/* Panel 2: Drafted check-in */}
                  <div className="p-6 flex flex-col justify-center" style={{ borderTop: "1px solid hsl(var(--landing-border))" }}>
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "hsl(var(--landing-accent))" }}
                      >
                        Drafted check-in
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: "hsl(var(--landing-accent) / 0.08)",
                          color: "hsl(var(--landing-accent))",
                        }}
                      >
                        MCQ
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold mb-4" style={{ color: "hsl(var(--landing-text))" }}>
                      A Type II error occurs when you…
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: "A", text: "Reject a true null hypothesis" },
                        { label: "B", text: "Fail to reject a false null hypothesis", correct: true },
                        { label: "C", text: "Accept the alternative hypothesis" },
                      ].map((opt) => (
                        <div
                          key={opt.label}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg text-[13px]"
                          style={{
                            border: `1px solid ${opt.correct ? "hsl(var(--landing-accent) / 0.35)" : "hsl(var(--landing-border))"}`,
                            backgroundColor: opt.correct ? "hsl(var(--landing-accent) / 0.04)" : "transparent",
                            color: "hsl(var(--landing-text))",
                          }}
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{
                              backgroundColor: opt.correct ? "hsl(var(--landing-accent))" : "hsl(var(--landing-border))",
                              color: opt.correct ? "white" : "hsl(var(--landing-muted))",
                            }}
                          >
                            {opt.label}
                          </span>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                    <button
                      className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-white pointer-events-none"
                      style={{ backgroundColor: "hsl(var(--landing-accent))" }}
                    >
                      Send to Room →
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block" style={{ backgroundColor: "hsl(var(--landing-border))" }} />

                  {/* Panel 3: Response signal */}
                  <div className="p-6 flex flex-col justify-center" style={{ borderTop: "1px solid hsl(var(--landing-border))" }}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "hsl(var(--landing-muted))" }}>
                      Room Signal
                    </span>
                    <div className="flex items-end gap-3 h-24 mb-4">
                      {[
                        { pct: 31, highlight: false },
                        { pct: 58, highlight: true },
                        { pct: 11, highlight: false },
                      ].map((bar, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: bar.highlight ? "hsl(var(--landing-accent))" : "hsl(var(--landing-muted))" }}>
                            {bar.pct}%
                          </span>
                          <div
                            className="w-full rounded-md"
                            style={{
                              height: `${bar.pct * 1.1}px`,
                              backgroundColor: bar.highlight ? "hsl(var(--landing-accent))" : "hsl(var(--landing-border))",
                              minHeight: "8px",
                            }}
                          />
                          <span className="text-[10px]" style={{ color: "hsl(var(--landing-muted))" }}>
                            {["A", "B", "C"][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="rounded-lg p-3 text-[12px] leading-snug"
                      style={{
                        backgroundColor: "hsl(var(--landing-accent) / 0.05)",
                        color: "hsl(var(--landing-text))",
                      }}
                    >
                      <span className="font-semibold" style={{ color: "hsl(var(--landing-accent))" }}>58% correct</span>
                      <span style={{ color: "hsl(var(--landing-muted))" }}> · 45 responded · </span>
                      <span className="font-medium">Consider revisiting</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>




        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <section id="how-it-works" className="py-24 md:py-32 px-6">
          <div className="max-w-[1120px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="landing-eyebrow mb-4">How It Works</p>
              <h2 className="landing-heading text-3xl md:text-4xl mb-4">
                Three steps. One continuous flow.
              </h2>
              <p className="landing-subheading text-base md:text-lg">
                Edvana fits into the way people already teach, train, explain,
                and present.
              </p>
            </div>

            {/* Steps grid */}
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  num: "1",
                  title: "Speak naturally",
                  body: "Teach, train, explain, or present the way you normally would. Edvana listens in real time without forcing you to stop and build activities from scratch.",
                  micro: "Real-time session context, without interrupting flow",
                },
                {
                  num: "2",
                  title: "Preview and send a live check-in",
                  body: "Edvana drafts a contextual audience check based on what you just said. You stay in control, review it, and send it when the moment is right.",
                  micro: "You review before participants ever see it",
                },
                {
                  num: "3",
                  title: "See the room instantly",
                  body: "Watch live response patterns appear while the session is still happening. Clarify, slow down, move on, or go deeper with actual signal from the room.",
                  micro: "Act while the session is still alive",
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="landing-card flex flex-col"
                >
                  {/* Step number */}
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-5"
                    style={{
                      backgroundColor: "hsl(var(--landing-accent) / 0.1)",
                      color: "hsl(var(--landing-accent))",
                    }}
                  >
                    {step.num}
                  </span>
                  <h3
                    className="text-[17px] font-semibold mb-3"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-[14px] leading-relaxed mb-auto"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {step.body}
                  </p>
                  {/* Micro-line */}
                  <div className="mt-6 flex items-center gap-2 text-[12px]" style={{ color: "hsl(var(--landing-muted))" }}>
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "hsl(var(--landing-accent))" }}
                    />
                    {step.micro}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ BUILT FOR THE LIVE MOMENT ═══════════ */}
        <section
          id="use-cases"
          className="py-24 md:py-32 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1120px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="landing-eyebrow mb-4">
                Why It Changes the Live Moment
              </p>
              <h2 className="landing-heading text-3xl md:text-4xl mb-4">
                Built for the live moment
              </h2>
              <p className="landing-subheading text-base md:text-lg">
                Edvana is designed for what speakers actually need in real
                sessions, not for static polling workflows.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  title: "No prebuilt polls",
                  body: "Edvana works from what's actually being said, so you do not have to plan every check-in in advance.",
                },
                {
                  title: "No broken flow",
                  body: "Check understanding without pausing to open a separate workflow, build a form, or derail momentum.",
                },
                {
                  title: "No delayed insight",
                  body: "See what the room understood while there is still time to respond, not after the moment has passed.",
                },
              ].map((card) => (
                <div key={card.title} className="landing-card">
                  <h3
                    className="text-[17px] font-semibold mb-3"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ WHY EDVANA IS DIFFERENT ═══════════ */}
        <section
          id="results"
          className="py-24 md:py-32 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1120px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="landing-eyebrow mb-4">
                Why Edvana Is Different
              </p>
              <h2 className="landing-heading text-2xl md:text-3xl">
                Polling collects responses.
                <br />
                Edvana helps you see understanding.
              </h2>
            </div>

            {/* Comparison columns */}
            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {/* Left — Traditional */}
              <div className="landing-card">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-5"
                  style={{ color: "hsl(var(--landing-muted))" }}
                >
                  Traditional polling tools
                </h3>
                <ul className="space-y-3">
                  {[
                    "Require prebuilt questions before the session",
                    "Interrupt flow to launch activities",
                    "Often get used inconsistently or abandoned",
                    "Focus on response collection more than live understanding",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[14px] leading-relaxed"
                      style={{ color: "hsl(var(--landing-muted))" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                        style={{ backgroundColor: "hsl(var(--landing-border))" }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — Edvana */}
              <div
                className="rounded-[0.875rem] p-7"
                style={{
                  border: "1px solid hsl(var(--landing-accent) / 0.25)",
                  backgroundColor: "hsl(var(--landing-accent) / 0.03)",
                }}
              >
                <h3
                  className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-5"
                  style={{ color: "hsl(var(--landing-accent))" }}
                >
                  Edvana
                </h3>
                <ul className="space-y-3">
                  {[
                    "Supports in-the-moment checks with minimal prep",
                    "Fits live teaching, training, and explanation flow",
                    "Lets leaders act while the session is still happening",
                    "Helps surface confusion before it becomes drift",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[14px] leading-relaxed"
                      style={{ color: "hsl(var(--landing-text))" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                        style={{ backgroundColor: "hsl(var(--landing-accent))" }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer line */}
            <p
              className="text-center text-[13px] leading-relaxed mt-12 max-w-xl mx-auto"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Polling tools help collect responses. Edvana helps speakers know
              what the room actually took away — while there is still time to
              adjust.
            </p>
          </div>
        </section>

        {/* ── Built for Real Sessions ── */}
        <section
          className="py-24 md:py-32 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1120px] mx-auto">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p
                className="text-[11px] font-semibold tracking-[0.18em] uppercase mb-4"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                Built for Real Sessions
              </p>
              <h2 className="landing-heading text-3xl md:text-4xl mb-4">
                Built for control in real sessions
              </h2>
              <p className="landing-subheading text-base md:text-lg">
                Edvana supports live use without taking control away from the speaker.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {[
                {
                  title: "Leader-controlled workflow",
                  body: "Every check-in is reviewed before it is sent.",
                },
                {
                  title: "Designed for sensitive environments",
                  body: "Built for settings where discretion, privacy, and responsible data handling matter.",
                },
                {
                  title: "Easy to pilot",
                  body: "Start small, test in a controlled setting, and expand once the workflow fits.",
                },
                {
                  title: "Low setup burden",
                  body: "No heavy implementation, no complex rollout, no bloated adoption overhead.",
                },
              ].map((card) => (
                <div key={card.title} className="landing-card">
                  <h3
                    className="text-[15px] font-semibold mb-2"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Results ── */}
        <section
          className="py-24 md:py-32 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1120px] mx-auto">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="landing-eyebrow mb-4">Results</p>
              <h2 className="landing-heading text-3xl md:text-4xl mb-4">
                Used in live sessions where understanding matters
              </h2>
              <p className="landing-subheading text-base md:text-lg">
                Edvana is already being used in explanation-heavy environments where it helps leaders see more, respond faster, and stay in flow.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {[
                {
                  eyebrow: "HIGHER EDUCATION",
                  title: "Intro to Writing",
                  stats: "12 sessions · 78% average response rate",
                  quote: "\u201cI demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.\u201d",
                  footer: "Repeat use: 4 of 5 class sessions",
                },
                {
                  eyebrow: "STEM INSTRUCTION",
                  title: "Engineering Fundamentals",
                  stats: "8 sessions · 85% average response rate",
                  quote: "\u201cIt was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!\u201d",
                  footer: "Repeat use: Every session after week 2",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="landing-card"
                >
                  <p className="landing-eyebrow mb-3">{card.eyebrow}</p>
                  <h3
                    className="text-lg font-bold mb-1"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-[12px] mb-6"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.stats}
                  </p>
                  <blockquote
                    className="text-[14px] leading-relaxed italic pl-4 mb-6"
                    style={{
                      color: "hsl(var(--landing-text))",
                      borderLeft: "2px solid hsl(var(--landing-accent))",
                    }}
                  >
                    {card.quote}
                  </blockquote>
                  <p
                    className="text-[12px]"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.footer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Use Cases Detail ── */}
        <section
          id="use-cases-detail"
          className="py-24 md:py-32 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1120px] mx-auto">
            <div className="max-w-2xl mx-auto text-center mb-16">
              <p className="landing-eyebrow mb-4">Use Cases</p>
              <h2 className="landing-heading text-3xl md:text-4xl mb-4">
                Where Edvana fits first
              </h2>
              <p className="landing-subheading text-base md:text-lg">
                Edvana is especially valuable in live sessions where explanation,
                interpretation, or complex material needs to land clearly in the
                moment.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {[
                {
                  title: "Higher education",
                  body: "For instructors teaching difficult, abstract, or explanation-heavy material.",
                },
                {
                  title: "Clinical and health-professions education",
                  body: "For nursing, medical, PA, and case-based learning environments.",
                },
                {
                  title: "Training and certification",
                  body: "For trainers who need live signal without heavy prep or clunky interaction tools.",
                },
                {
                  title: "Workshops and cohort-based sessions",
                  body: "For facilitators leading high-attention learning experiences.",
                },
              ].map((card) => (
                <div key={card.title} className="landing-card">
                  <h3
                    className="text-[17px] font-semibold mb-2"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>




        {/* ── Final CTA ── */}
        <section
          id="demo"
          className="py-28 md:py-36 px-6"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-xl mx-auto text-center">
            <h2 className="landing-heading text-3xl md:text-4xl mb-5">
              See how Edvana changes a live session.
            </h2>
            <p
              className="landing-subheading text-base mb-11"
            >
              Book a short demo or start a pilot conversation to see how Edvana
              supports real-time understanding in teaching, training, and
              explanation-heavy live sessions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <button
                onClick={handleBookDemo}
                className="landing-cta px-8 py-3 text-[15px]"
              >
                Book a Demo
              </button>
              <button
                onClick={() => navigate("/instructor/auth")}
                className="landing-secondary-btn px-8 py-3 text-[15px]"
              >
                Start a Pilot Conversation
              </button>
            </div>
            <p
              className="text-[12px]"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Short demo. Clear workflow. No bloated setup.
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer
        className="py-14 px-6"
        style={{
          background: "hsl(var(--landing-surface))",
          borderTop: "1px solid hsl(var(--landing-border))",
        }}
      >
        <div className="max-w-[1120px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            {/* Product */}
            <div>
              <h4
                className="text-[13px] font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Product
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Product", id: "product" },
                  { label: "How It Works", id: "how-it-works" },
                  { label: "Why Edvana", id: "results" },
                  { label: "Use Cases", id: "use-cases-detail" },
                  { label: "Results", id: "results" },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => scrollToSection(link.id)}
                      className="text-[13px] transition-colors duration-150 hover:opacity-80"
                      style={{ color: "hsl(var(--landing-muted))" }}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sessions */}
            <div>
              <h4
                className="text-[13px] font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Sessions
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Book a Demo", action: handleBookDemo },
                  { label: "Start a Pilot", action: () => navigate("/instructor/auth") },
                  { label: "Join Session", action: () => navigate("/join") },
                  { label: "Login", action: () => navigate("/auth") },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.action}
                      className="text-[13px] transition-colors duration-150 hover:opacity-80"
                      style={{ color: "hsl(var(--landing-muted))" }}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4
                className="text-[13px] font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Company
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "About", action: () => scrollToSection("hero") },
                  { label: "Contact", action: handleBookDemo },
                  { label: "Privacy", action: () => navigate("/privacy") },
                  { label: "Terms", action: () => navigate("/terms") },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.action}
                      className="text-[13px] transition-colors duration-150 hover:opacity-80"
                      style={{ color: "hsl(var(--landing-muted))" }}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Brand */}
            <div>
              <p
                className="text-[13px] font-semibold mb-2"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Edvana is the copilot for live understanding.
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                Helping speakers see audience understanding in real time without
                breaking flow.
              </p>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="pt-6"
            style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
          >
            <p
              className="text-[11px]"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              © 2026 Edvana. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
