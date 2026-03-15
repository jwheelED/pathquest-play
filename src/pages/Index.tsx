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
      </main>
    </div>
  );
};

export default Index;
