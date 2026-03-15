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

      {/* ═══════════ PAGE SHELL ═══════════ */}
      <main className="min-h-[80vh]">
        {/* Sections will be built in subsequent rounds */}
      </main>
    </div>
  );
};

export default Index;
