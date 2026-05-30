import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

/* ── Pricing data ── */
const SELF_SERVE_CAPACITIES = ["Up to 50", "Up to 150", "Up to 300"] as const;
const SELF_SERVE_ROWS: { duration: string; prices: string[] }[] = [
  { duration: "1 hour", prices: ["$29", "$69", "$129"] },
  { duration: "2 hours", prices: ["$49", "$119", "$219"] },
  { duration: "4 hours", prices: ["$79", "$179", "$329"] },
  { duration: "Full day", prices: ["$129", "$279", "$399"] },
];

const PREMIUM_CAPACITIES = ["Up to 300", "Up to 500"] as const;
const PREMIUM_ROWS: { duration: string; prices: string[] }[] = [
  { duration: "1 hour", prices: ["$399", "$599"] },
  { duration: "2 hours", prices: ["$649", "$949"] },
  { duration: "4 hours", prices: ["$899", "$1,299"] },
];

/* ── Component ── */
const CorporateEvents = () => {
  const navigate = useNavigate();
  const [tier, setTier] = useState<"self-serve" | "premium">("self-serve");

  return (
    <div className="landing-page min-h-screen">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur-sm"
        style={{
          borderColor: "hsl(var(--landing-border))",
          backgroundColor: "hsl(var(--landing-bg) / 0.92)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            aria-label="Edvana home"
            onClick={() => navigate("/")}
            className="bg-transparent border-0 p-0 cursor-pointer"
          >
            <img
              src={edvanaLogo}
              alt="Edvana logo"
              className="h-8"
            />
          </button>
          <button
            onClick={() => navigate("/")}
            className="landing-secondary-btn inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════
          SECTION 1 — Hero
         ══════════════════════════════════════ */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <p className="landing-eyebrow mb-4">EDVANA FOR EVENTS</p>
        <h1 className="landing-heading text-4xl md:text-5xl lg:text-[3.25rem] mb-6">
          Real-time audience understanding
          <br className="hidden sm:block" /> for your live event.
        </h1>
        <p className="landing-subheading text-base md:text-lg max-w-2xl mx-auto mb-12">
          No subscription required. Buy the time you need, for the room you
          have. Edvana generates live understanding checks from your speaker's
          words in real time, so your audience stays engaged and your team sees
          what the room actually took away.
        </p>

        {/* Proof points */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          {[
            "No prebuilt polls required",
            "Speaker stays in full control",
            "Launch pricing for early event partners",
          ].map((point) => (
            <div key={point} className="flex items-center gap-2 text-sm font-medium" style={{ color: "hsl(var(--landing-text))" }}>
              <Check className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(var(--landing-accent))" }} />
              {point}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 2 — How It Works
         ══════════════════════════════════════ */}
      <section
        className="py-20"
        style={{ backgroundColor: "hsl(var(--landing-surface))" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <p className="landing-eyebrow mb-3 text-center">HOW IT WORKS</p>
          <h2 className="landing-heading text-3xl md:text-4xl text-center mb-3">
            Buy a block of time. Run your event. See the room.
          </h2>
          <p className="landing-subheading text-center max-w-2xl mx-auto mb-14">
            Edvana works like a venue rental, not a software subscription. You
            pick your duration and your room size. The session activates when you
            are ready. You pay once and you are done.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Choose your event size and duration",
                body: "Pick the capacity tier that matches your expected attendance and the time block you need. No annual commitment.",
              },
              {
                step: "2",
                title: "Run your event with live understanding",
                body: "Edvana listens while your speaker presents and drafts real-time audience checks automatically. You review and send. The room responds instantly.",
              },
              {
                step: "3",
                title: "See what the room took away",
                body: "Live response patterns surface while the session is still happening. Post-event insights are delivered automatically.",
              },
            ].map((s) => (
              <div key={s.step} className="landing-card flex flex-col">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold mb-4"
                  style={{
                    backgroundColor: "hsl(var(--landing-accent) / 0.1)",
                    color: "hsl(var(--landing-accent))",
                  }}
                >
                  {s.step}
                </span>
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "hsl(var(--landing-text))" }}
                >
                  {s.title}
                </h3>
                <p className="landing-subheading text-sm leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 3 — Two Ways to Run an Event
         ══════════════════════════════════════ */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="landing-eyebrow mb-3 text-center">
            TWO WAYS TO RUN AN EVENT
          </p>
          <h2 className="landing-heading text-3xl md:text-4xl text-center mb-12">
            Self-serve or fully supported. You choose.
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Self-Serve */}
            <div className="landing-card flex flex-col justify-between">
              <div>
                <h3
                  className="font-semibold text-lg mb-3"
                  style={{ color: "hsl(var(--landing-text))" }}
                >
                  Self-Serve Events
                </h3>
                <p className="landing-subheading text-sm leading-relaxed mb-6">
                  Buy your event online in under two minutes. Set up your
                  session, share your join code, and run it yourself. Best for
                  teams who know what they need and want to move fast.
                </p>
              </div>
              <span
                className="inline-block text-xs font-semibold px-3 py-1 rounded-full w-fit"
                style={{
                  backgroundColor: "hsl(var(--landing-accent) / 0.08)",
                  color: "hsl(var(--landing-accent))",
                }}
              >
                No setup call required
              </span>
            </div>

            {/* Premium */}
            <div className="landing-card flex flex-col justify-between">
              <div>
                <h3
                  className="font-semibold text-lg mb-3"
                  style={{ color: "hsl(var(--landing-text))" }}
                >
                  Premium Events
                </h3>
                <p className="landing-subheading text-sm leading-relaxed mb-6">
                  For high-stakes sessions where you want setup assistance, live
                  monitoring, post-event insights, and a branded participant
                  experience. A short intake form gets you a tailored quote.
                </p>
              </div>
              <span
                className="inline-block text-xs font-semibold px-3 py-1 rounded-full w-fit"
                style={{
                  backgroundColor: "hsl(var(--landing-accent) / 0.08)",
                  color: "hsl(var(--landing-accent))",
                }}
              >
                Includes support and setup
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 4 — Pricing
         ══════════════════════════════════════ */}
      <section
        className="py-20"
        style={{ backgroundColor: "hsl(var(--landing-surface))" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <p className="landing-eyebrow mb-3 text-center">PRICING</p>
          <h2 className="landing-heading text-3xl md:text-4xl text-center mb-3">
            Launch pricing for early event partners.
          </h2>
          <p className="landing-subheading text-center max-w-2xl mx-auto mb-10">
            Simple, transparent, and based on how long your event runs and how
            many people attend. No subscriptions. No per-user fees. No surprise
            charges.
          </p>

          {/* Tier toggle */}
          <div className="flex justify-center mb-10">
            <div
              className="inline-flex rounded-full p-1"
              style={{
                backgroundColor: "hsl(var(--landing-border))",
              }}
            >
              {(["self-serve", "premium"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className="px-6 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                  style={{
                    backgroundColor:
                      tier === t ? "hsl(var(--landing-accent))" : "transparent",
                    color:
                      tier === t ? "#fff" : "hsl(var(--landing-muted))",
                  }}
                >
                  {t === "self-serve" ? "Self-Serve" : "Premium"}
                </button>
              ))}
            </div>
          </div>

          {/* Self-Serve matrix */}
          {tier === "self-serve" && (
            <div className="landing-card">
              <p
                className="text-sm font-medium mb-6"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                For events up to 300 attendees. Buy online. No support included.
              </p>

              <div className="overflow-x-auto -mx-2">
                <table className="w-full border-collapse text-sm min-w-[480px]">
                  <thead>
                    <tr>
                      <th
                        className="text-left py-3 px-4 font-semibold"
                        style={{ color: "hsl(var(--landing-text))" }}
                      >
                        Duration
                      </th>
                      {SELF_SERVE_CAPACITIES.map((cap) => (
                        <th
                          key={cap}
                          className="text-center py-3 px-4 font-semibold"
                          style={{ color: "hsl(var(--landing-text))" }}
                        >
                          {cap}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SELF_SERVE_ROWS.map((row) => (
                      <tr
                        key={row.duration}
                        style={{
                          borderTop: "1px solid hsl(var(--landing-border))",
                        }}
                      >
                        <td
                          className="py-4 px-4 font-medium"
                          style={{ color: "hsl(var(--landing-text))" }}
                        >
                          {row.duration}
                        </td>
                        {row.prices.map((price, ci) => (
                          <td
                            key={ci}
                            className="py-4 px-4 text-center font-semibold transition-colors duration-150 rounded-lg cursor-default"
                            style={{ color: "hsl(var(--landing-text))" }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "hsl(var(--landing-accent) / 0.07)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "transparent";
                            }}
                          >
                            {price}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p
                className="text-xs mt-6 leading-relaxed"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                If your expected attendance exceeds your tier during a live
                event, you will see a one-click upgrade prompt. No one gets cut
                off.
              </p>

              <div className="mt-8 text-center">
                <a
                  href="mailto:nigel@edvana.dev?subject=Plan%20My%20Event&body=I%27d%20like%20to%20plan%20an%20event%20with%20Edvana."
                  className="landing-cta inline-block"
                >
                  Plan Your Event
                </a>
              </div>
            </div>
          )}

          {/* Premium matrix */}
          {tier === "premium" && (
            <div className="landing-card">
              <p
                className="text-sm font-medium mb-6"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                For high-stakes events up to 500 attendees. Includes setup
                support, live monitoring, and post-event insights.
              </p>

              <div className="overflow-x-auto -mx-2">
                <table className="w-full border-collapse text-sm min-w-[380px]">
                  <thead>
                    <tr>
                      <th
                        className="text-left py-3 px-4 font-semibold"
                        style={{ color: "hsl(var(--landing-text))" }}
                      >
                        Duration
                      </th>
                      {PREMIUM_CAPACITIES.map((cap) => (
                        <th
                          key={cap}
                          className="text-center py-3 px-4 font-semibold"
                          style={{ color: "hsl(var(--landing-text))" }}
                        >
                          {cap}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PREMIUM_ROWS.map((row) => (
                      <tr
                        key={row.duration}
                        style={{
                          borderTop: "1px solid hsl(var(--landing-border))",
                        }}
                      >
                        <td
                          className="py-4 px-4 font-medium"
                          style={{ color: "hsl(var(--landing-text))" }}
                        >
                          {row.duration}
                        </td>
                        {row.prices.map((price, ci) => (
                          <td
                            key={ci}
                            className="py-4 px-4 text-center font-semibold transition-colors duration-150 rounded-lg cursor-default"
                            style={{ color: "hsl(var(--landing-text))" }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "hsl(var(--landing-accent) / 0.07)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor =
                                "transparent";
                            }}
                          >
                            {price}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p
                className="text-xs mt-6 leading-relaxed"
                style={{ color: "hsl(var(--landing-muted))" }}
              >
                Full-day premium events and multi-session packages are available.
                Contact us for a custom quote.
              </p>

              <div className="mt-8 text-center">
                <a
                  href="mailto:nigel@edvana.dev?subject=Request%20a%20Quote%20-%20Premium%20Event&body=I%27d%20like%20a%20quote%20for%20a%20premium%20event."
                  className="landing-cta inline-block"
                >
                  Request a Quote
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 5 — Enterprise Callout
         ══════════════════════════════════════ */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div
            className="landing-card text-center"
            style={{
              borderColor: "hsl(var(--landing-accent) / 0.25)",
              borderWidth: "1px",
            }}
          >
            <p className="landing-eyebrow mb-3">ENTERPRISE</p>
            <h2 className="landing-heading text-2xl md:text-3xl mb-4">
              Running events across teams, departments, or your entire
              organization?
            </h2>
            <p className="landing-subheading text-sm max-w-xl mx-auto mb-8">
              Enterprise plans start at $6,000 annually and include unlimited
              events, white-label options, a dedicated success manager, and
              organizational billing. Pricing is scoped to your needs through a
              short conversation.
            </p>
            <a
              href="mailto:nigel@edvana.dev?subject=Enterprise%20Events%20Inquiry&body=I%27m%20interested%20in%20an%20enterprise%20events%20plan."
              className="landing-cta inline-block"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 6 — Built for Live Events
         ══════════════════════════════════════ */}
      <section
        className="py-20"
        style={{ backgroundColor: "hsl(var(--landing-surface))" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <p className="landing-eyebrow mb-3 text-center">BUILT FOR LIVE EVENTS</p>
          <h2 className="landing-heading text-3xl md:text-4xl text-center mb-12">
            What makes Edvana different for events.
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "No prebuilt polls",
                body: "Edvana drafts understanding checks from your speaker's live words. You do not have to build anything before the event starts.",
              },
              {
                title: "Speaker stays in control",
                body: "Every check-in is reviewed before it goes to the room. Nothing is sent automatically.",
              },
              {
                title: "Participants join in seconds",
                body: "No app download. No account required. Scan a QR code or enter a session code and you are in.",
              },
              {
                title: "Pricing that matches how events work",
                body: "You buy a block of time for your room size. No subscriptions. No annual commitments. No paying for features you will never use.",
              },
            ].map((card) => (
              <div key={card.title} className="landing-card">
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "hsl(var(--landing-text))" }}
                >
                  {card.title}
                </h3>
                <p className="landing-subheading text-sm leading-relaxed">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 7 — Final CTA
         ══════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="landing-heading text-3xl md:text-4xl mb-4">
            Ready to bring real-time understanding to your next event?
          </h2>
          <p className="landing-subheading text-base max-w-xl mx-auto mb-10">
            Start with self-serve and be running in under two minutes, or tell us
            about your event and we will help you find the right setup.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <a
              href="mailto:nigel@edvana.dev?subject=Plan%20My%20Event&body=I%27d%20like%20to%20plan%20an%20event%20with%20Edvana."
              className="landing-cta inline-block"
            >
              Plan Your Event
            </a>
            <a
              href="mailto:nigel@edvana.dev?subject=Talk%20to%20the%20Team&body=I%27d%20like%20to%20discuss%20running%20an%20event%20with%20Edvana."
              className="landing-secondary-btn inline-block"
            >
              Talk to the Team
            </a>
          </div>
          <p
            className="text-xs"
            style={{ color: "hsl(var(--landing-muted))" }}
          >
            Launch pricing available for early event partners.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t py-8"
        style={{ borderColor: "hsl(var(--landing-border))" }}
      >
        <div
          className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs"
          style={{ color: "hsl(var(--landing-muted))" }}
        >
          <span>© {new Date().getFullYear()} Edvana. All rights reserved.</span>
          <div className="flex gap-6">
            <Link to="/privacy" className="landing-util-link">
              Privacy Policy
            </Link>
            <Link to="/terms" className="landing-util-link">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default CorporateEvents;
