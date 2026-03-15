import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Menu, X } from "lucide-react";
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

  const handleBookDemo = () => {
    window.location.href =
      "mailto:nigel@edvana.dev?subject=Demo Request&body=I'd like to schedule a demo of Edvana.";
  };

  return (
    <div className="landing-page min-h-screen">
      {/* ═══════════ HEADER ═══════════ */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: "hsl(var(--landing-surface) / 0.82)",
          borderColor: "hsl(var(--landing-border))",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
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
              onClick={() => navigate("/instructor/auth")}
              className="landing-util-link"
            >
              Login
            </button>
            <button
              onClick={() => navigate("/join")}
              className="landing-util-link"
            >
              Join Session
            </button>
            <button onClick={handleBookDemo} className="landing-cta">
              Book a Demo
            </button>
          </div>

          {/* Mobile — CTA + Hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            <button onClick={handleBookDemo} className="landing-cta text-xs px-4 py-1.5">
              Book a Demo
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
            className="lg:hidden border-t px-6 py-4 space-y-1"
            style={{
              backgroundColor: "hsl(var(--landing-surface))",
              borderColor: "hsl(var(--landing-border))",
            }}
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => {
                  scrollToSection(item.toLowerCase().replace(/\s+/g, "-"));
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-2 landing-nav-link"
              >
                {item}
              </button>
            ))}
            <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: "hsl(var(--landing-border))" }}>
              <button
                onClick={() => navigate("/instructor/auth")}
                className="landing-util-link text-left py-2"
              >
                Login
              </button>
              <button
                onClick={() => navigate("/join")}
                className="landing-util-link text-left py-2"
              >
                Join Session
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <main>
        <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 px-6">
          <div className="max-w-[1200px] mx-auto">
            {/* Text block */}
            <div className="max-w-2xl mx-auto text-center">
              {/* Eyebrow */}
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-5"
                style={{ color: "hsl(var(--landing-accent))" }}
              >
                Live understanding, in real time
              </p>

              {/* Headline */}
              <h1
                className="text-4xl md:text-[56px] lg:text-[64px] font-bold leading-[1.08] tracking-tight mb-5"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                See understanding while you speak.
              </h1>

              {/* Subheadline */}
              <p
                className="text-lg md:text-xl leading-relaxed mb-10 max-w-xl mx-auto"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                Edvana helps speakers turn live questions into instant audience
                understanding checks, so they can adjust in real time without
                breaking flow.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
                <button onClick={handleBookDemo} className="landing-cta px-7 py-3 text-[15px]">
                  Book a Demo
                </button>
                <button
                  onClick={() => scrollToSection("how-it-works")}
                  className="rounded-full px-7 py-3 text-[15px] font-semibold transition-all duration-200 border"
                  style={{
                    color: "hsl(var(--landing-text))",
                    borderColor: "hsl(var(--landing-border))",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "hsl(var(--landing-border))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Watch It Work
                </button>
              </div>

              {/* Proof points */}
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm" style={{ color: "hsl(var(--landing-muted))" }}>
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
            <div className="mt-16 md:mt-20 max-w-4xl mx-auto">
              <div
                className="rounded-2xl border overflow-hidden"
                style={{
                  borderColor: "hsl(var(--landing-border))",
                  backgroundColor: "hsl(var(--landing-surface))",
                  boxShadow: "0 24px 80px -12px hsl(220 20% 12% / 0.08), 0 0 0 1px hsl(220 10% 92% / 0.5)",
                }}
              >
                {/* Flow steps bar */}
                <div
                  className="flex items-center gap-0 border-b text-xs font-medium"
                  style={{ borderColor: "hsl(var(--landing-border))" }}
                >
                  {[
                    { num: "1", label: "Speaker is live" },
                    { num: "2", label: "Edvana drafts a check-in" },
                    { num: "3", label: "Sent to audience" },
                    { num: "4", label: "Signal appears" },
                  ].map((step, i) => (
                    <div
                      key={step.num}
                      className="flex-1 flex items-center gap-2 px-4 py-3 border-r last:border-r-0"
                      style={{
                        borderColor: "hsl(var(--landing-border))",
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
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
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
                            backgroundColor: "hsl(var(--landing-accent) / 0.35)",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block" style={{ backgroundColor: "hsl(var(--landing-border))" }} />

                  {/* Panel 2: Drafted check-in */}
                  <div className="p-6 flex flex-col justify-center border-t md:border-t-0" style={{ borderColor: "hsl(var(--landing-border))" }}>
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
                          className="flex items-center gap-2.5 p-2.5 rounded-lg text-[13px] border"
                          style={{
                            borderColor: opt.correct ? "hsl(var(--landing-accent) / 0.4)" : "hsl(var(--landing-border))",
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
                  <div className="p-6 flex flex-col justify-center border-t md:border-t-0" style={{ borderColor: "hsl(var(--landing-border))" }}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "hsl(var(--landing-muted))" }}>
                      Room Signal
                    </span>
                    {/* Vertical bars */}
                    <div className="flex items-end gap-3 h-24 mb-4">
                      {[
                        { pct: 31, color: "hsl(var(--landing-border))" },
                        { pct: 58, color: "hsl(var(--landing-accent))" },
                        { pct: 11, color: "hsl(var(--landing-border))" },
                      ].map((bar, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: i === 1 ? "hsl(var(--landing-accent))" : "hsl(var(--landing-muted))" }}>
                            {bar.pct}%
                          </span>
                          <div
                            className="w-full rounded-md"
                            style={{
                              height: `${bar.pct * 1.1}px`,
                              backgroundColor: bar.color,
                              minHeight: "8px",
                            }}
                          />
                          <span className="text-[10px]" style={{ color: "hsl(var(--landing-muted))" }}>
                            {["A", "B", "C"][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Insight line */}
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

        {/* ═══════════ CATEGORY-FRAMING STRIP ═══════════ */}
        <section
          className="border-y py-20 md:py-24 px-6"
          style={{
            borderColor: "hsl(var(--landing-border))",
            backgroundColor: "hsl(var(--landing-surface))",
          }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="text-2xl md:text-3xl font-bold leading-snug tracking-tight mb-5"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              The missing feedback loop in live communication
            </h2>
            <p
              className="text-[15px] md:text-base leading-relaxed"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Most speakers ask questions and get silence, guesses, or delayed
              answers. Edvana turns spoken questions into live room signal in
              seconds, so understanding becomes visible while the moment is
              still alive.
            </p>
          </div>
        </section>

        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <section id="how-it-works" className="py-20 md:py-28 px-6">
          <div className="max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-4"
                style={{ color: "hsl(var(--landing-accent))" }}
              >
                How It Works
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold leading-tight tracking-tight mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Three steps. One continuous flow.
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
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
                  className="rounded-xl border p-7 flex flex-col"
                  style={{
                    borderColor: "hsl(var(--landing-border))",
                    backgroundColor: "hsl(var(--landing-surface))",
                    boxShadow:
                      "0 2px 12px -4px hsl(220 20% 12% / 0.04)",
                  }}
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
                    className="text-lg font-semibold mb-3"
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
          className="py-20 md:py-28 px-6 border-t"
          style={{ borderColor: "hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-4"
                style={{ color: "hsl(var(--landing-accent))" }}
              >
                Why It Changes the Live Moment
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold leading-tight tracking-tight mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Built for the live moment
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
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
                <div
                  key={card.title}
                  className="rounded-xl border p-7"
                  style={{
                    borderColor: "hsl(var(--landing-border))",
                    backgroundColor: "hsl(var(--landing-surface))",
                    boxShadow:
                      "0 2px 12px -4px hsl(220 20% 12% / 0.04)",
                  }}
                >
                  <h3
                    className="text-lg font-semibold mb-3"
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
          className="py-20 md:py-28 px-6 border-t"
          style={{ borderColor: "hsl(var(--landing-border))" }}
        >
          <div className="max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="max-w-2xl mx-auto text-center mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-4"
                style={{ color: "hsl(var(--landing-accent))" }}
              >
                Why Edvana Is Different
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold leading-tight tracking-tight"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Polling collects responses.
                <br />
                Edvana helps you see understanding.
              </h2>
            </div>

            {/* Comparison columns */}
            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {/* Left — Traditional */}
              <div
                className="rounded-xl border p-7"
                style={{
                  borderColor: "hsl(var(--landing-border))",
                  backgroundColor: "hsl(var(--landing-surface))",
                }}
              >
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-5"
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
                className="rounded-xl border p-7"
                style={{
                  borderColor: "hsl(var(--landing-accent) / 0.3)",
                  backgroundColor: "hsl(var(--landing-accent) / 0.03)",
                }}
              >
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-5"
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
              className="text-center text-[13px] leading-relaxed mt-10 max-w-xl mx-auto"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Polling tools help collect responses. Edvana helps speakers know
              what the room actually took away — while there is still time to
              adjust.
            </p>
          </div>
        </section>

        {/* ── Section: Built for Real Sessions ── */}
        <section
          className="py-20"
          style={{
            borderTop: "1px solid hsl(var(--landing-border))",
          }}
        >
          <div className="max-w-5xl mx-auto px-6">
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 text-center"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              BUILT FOR REAL SESSIONS
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-4"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              Built for control in real sessions
            </h2>
            <p
              className="text-base md:text-lg leading-relaxed text-center max-w-2xl mx-auto mb-14"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Edvana supports live use without taking control away from the speaker.
            </p>

            <div className="grid md:grid-cols-2 gap-5">
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
                <div
                  key={card.title}
                  className="rounded-xl p-6"
                  style={{
                    backgroundColor: "hsl(var(--landing-surface))",
                    border: "1px solid hsl(var(--landing-border))",
                  }}
                >
                  <h3
                    className="text-[15px] font-semibold mb-2"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section: Results ── */}
        <section
          className="py-20"
          style={{
            borderTop: "1px solid hsl(var(--landing-border))",
          }}
        >
          <div className="max-w-5xl mx-auto px-6">
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 text-center"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              RESULTS
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-4"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              Used in live sessions where understanding matters
            </h2>
            <p
              className="text-base md:text-lg leading-relaxed text-center max-w-2xl mx-auto mb-14"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Edvana is already being used in explanation-heavy environments where it helps leaders see more, respond faster, and stay in flow.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  eyebrow: "HIGHER EDUCATION",
                  title: "Intro to Writing",
                  stats: "12 sessions \u00b7 78% average response rate",
                  quote: "\u201cI demoed this. It has tremendous promise for student engagement. Finally, a way to know if my students are following along.\u201d",
                  footer: "Repeat use: 4 of 5 class sessions",
                },
                {
                  eyebrow: "STEM INSTRUCTION",
                  title: "Engineering Fundamentals",
                  stats: "8 sessions \u00b7 85% average response rate",
                  quote: "\u201cIt was quite refreshing to have quick questions about what was said a few minutes ago. Keeps me focused!\u201d",
                  footer: "Repeat use: Every session after week 2",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl p-7"
                  style={{
                    backgroundColor: "hsl(var(--landing-surface))",
                    border: "1px solid hsl(var(--landing-border))",
                    boxShadow: "0 2px 8px -2px hsl(220 25% 15% / 0.05)",
                  }}
                >
                  <p
                    className="text-[11px] font-semibold tracking-[0.15em] uppercase mb-3"
                    style={{ color: "hsl(var(--landing-accent))" }}
                  >
                    {card.eyebrow}
                  </p>
                  <h3
                    className="text-lg font-bold mb-1"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-xs mb-5"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.stats}
                  </p>
                  <blockquote
                    className="text-sm leading-relaxed italic pl-4 mb-5"
                    style={{
                      color: "hsl(var(--landing-text))",
                      borderLeft: "2px solid hsl(var(--landing-accent))",
                    }}
                  >
                    {card.quote}
                  </blockquote>
                  <p
                    className="text-xs"
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
          className="py-20"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-5xl mx-auto px-6">
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 text-center"
              style={{ color: "hsl(var(--landing-accent))" }}
            >
              USE CASES
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-center"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              Where Edvana fits first
            </h2>
            <p
              className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-14 text-center"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Edvana is especially valuable in live sessions where explanation,
              interpretation, or complex material needs to land clearly in the
              moment.
            </p>
            <div className="grid md:grid-cols-2 gap-5">
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
                <div
                  key={card.title}
                  className="rounded-xl p-7"
                  style={{
                    background: "hsl(var(--landing-surface))",
                    border: "1px solid hsl(var(--landing-border))",
                  }}
                >
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ color: "hsl(var(--landing-text))" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "hsl(var(--landing-muted))" }}
                  >
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Emotional Midpoint ── */}
        <section
          className="py-20"
          style={{
            background: "hsl(var(--landing-surface))",
            borderTop: "1px solid hsl(var(--landing-border))",
            borderBottom: "1px solid hsl(var(--landing-border))",
          }}
        >
          <div className="max-w-2xl mx-auto px-6 text-center">
            <h2
              className="text-2xl md:text-3xl font-bold tracking-tight mb-5"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              When you speak, you should not have to do it blind.
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Most live sessions are one-way by default. Edvana helps turn them
              into responsive moments by making audience understanding visible
              in real time.
            </p>
          </div>
        </section>

        {/* ── Vision ── */}
        <section
          className="py-20"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-2xl mx-auto px-6 text-center">
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
              style={{ color: "hsl(var(--landing-accent))" }}
            >
              VISION
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-5"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              A new layer for live understanding
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Edvana exists to make understanding visible while communication is
              still happening. When speakers can see the room in real time,
              people can learn, align, and adapt faster together.
            </p>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section
          id="demo"
          className="py-24"
          style={{ borderTop: "1px solid hsl(var(--landing-border))" }}
        >
          <div className="max-w-2xl mx-auto px-6 text-center">
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ color: "hsl(var(--landing-text))" }}
            >
              See how Edvana changes a live session.
            </h2>
            <p
              className="text-base leading-relaxed mb-10"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Book a short demo or start a pilot conversation to see how Edvana
              supports real-time understanding in teaching, training, and
              explanation-heavy live sessions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <button
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-8 py-3 text-[15px] font-semibold transition-all duration-200"
                style={{
                  background: "hsl(var(--landing-accent))",
                  color: "#fff",
                }}
              >
                Book a Demo
              </button>
              <button
                onClick={() => navigate("/instructor/auth")}
                className="rounded-full px-8 py-3 text-[15px] font-semibold transition-all duration-200 border"
                style={{
                  borderColor: "hsl(var(--landing-border))",
                  color: "hsl(var(--landing-text))",
                }}
              >
                Start a Pilot Conversation
              </button>
            </div>
            <p
              className="text-xs"
              style={{ color: "hsl(var(--landing-muted))" }}
            >
              Short demo. Clear workflow. No bloated setup.
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer
        className="py-16"
        style={{
          background: "hsl(var(--landing-surface))",
          borderTop: "1px solid hsl(var(--landing-border))",
        }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
            {/* Product */}
            <div>
              <h4
                className="text-sm font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Product
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Product", id: "product" },
                  { label: "How It Works", id: "how-it-works" },
                  { label: "Why Edvana", id: "why-edvana" },
                  { label: "Use Cases", id: "use-cases-detail" },
                  { label: "Results", id: "results" },
                ].map((link) => (
                  <li key={link.id}>
                    <button
                      onClick={() => scrollToSection(link.id)}
                      className="text-sm transition-colors duration-150 hover:opacity-80"
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
                className="text-sm font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Sessions
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Book a Demo", action: () => navigate("/instructor/auth") },
                  { label: "Start a Pilot", action: () => navigate("/instructor/auth") },
                  { label: "Join Session", action: () => navigate("/join") },
                  { label: "Login", action: () => navigate("/auth") },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.action}
                      className="text-sm transition-colors duration-150 hover:opacity-80"
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
                className="text-sm font-semibold mb-4"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Company
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "About", action: () => scrollToSection("hero") },
                  { label: "Contact", action: () => navigate("/instructor/auth") },
                  { label: "Privacy", action: () => navigate("/privacy") },
                  { label: "Terms", action: () => navigate("/terms") },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={link.action}
                      className="text-sm transition-colors duration-150 hover:opacity-80"
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
                className="text-sm font-semibold mb-2"
                style={{ color: "hsl(var(--landing-text))" }}
              >
                Edvana is the copilot for live understanding.
              </p>
              <p
                className="text-xs leading-relaxed"
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
              className="text-xs"
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
