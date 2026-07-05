import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import edvanaLogo from "@/assets/edvana-logo-copilot.png";

const BoothFlyer = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#ededed] py-8 px-4">
      <Helmet>
        <title>Edvana booth flyer — every lecture, understood</title>
        <meta name="description" content="Printable one-page overview of Edvana: live lecture capture, AI check-ins, and analytics for instructors." />
        <link rel="canonical" href="https://edvana.dev/flyer" />
        <meta property="og:title" content="Edvana booth flyer — every lecture, understood" />
        <meta property="og:description" content="Printable one-page overview of Edvana." />
        <meta property="og:url" content="https://edvana.dev/flyer" />
      </Helmet>
      <div className="max-w-[8.5in] mx-auto space-y-10">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/learn-more")}
          className="text-[#ededed] hover:text-white gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        {/* ===== PAGE 1 — FRONT ===== */}
        <div
          className="bg-black rounded-lg overflow-hidden shadow-2xl"
          style={{ aspectRatio: "8.5 / 11" }}
        >
          <div className="h-full flex flex-col">
            {/* Green top bar */}
            <div className="h-2 bg-[#388e6e] shrink-0" />

            <div className="flex-1 flex flex-col items-center justify-between px-8 py-10 md:px-14 md:py-14">
              {/* Logo */}
              <img
                src={edvanaLogo}
                alt="Edvana – The copilot for live understanding"
                className="h-14 md:h-20 object-contain"
              />

              {/* Hero */}
              <div className="text-center space-y-3">
                <div className="w-24 h-[2px] bg-[#388e6e] mx-auto" />
                <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                  <span className="text-white">Every Lecture.</span>{" "}
                  <span className="text-[#388e6e]">Understood.</span>
                </h1>
                <p className="text-[#ededed] text-sm md:text-lg max-w-md mx-auto pt-2">
                  AI-powered lecture capture &amp; real-time assessments that
                  help instructors teach smarter.
                </p>
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-3 md:gap-5 w-full max-w-lg">
                {[
                  {
                    icon: "🎤",
                    title: "CAPTURE",
                    desc: "Live lecture transcription with automatic content analysis",
                  },
                  {
                    icon: "🧠",
                    title: "AI QUESTIONS",
                    desc: "Smart check-ins generated from your lecture in real-time",
                  },
                  {
                    icon: "📊",
                    title: "ANALYTICS",
                    desc: "Track engagement & identify struggling students instantly",
                  },
                ].map((f) => (
                  <div
                    key={f.title}
                    className="bg-[#1a1a1a] rounded-lg overflow-hidden"
                  >
                    <div className="h-1.5 bg-[#388e6e]" />
                    <div className="p-3 md:p-4 text-center space-y-1.5">
                      <span className="text-2xl">{f.icon}</span>
                      <p className="text-[#388e6e] font-bold text-[10px] md:text-xs tracking-wide">
                        {f.title}
                      </p>
                      <p className="text-[#ededed] text-[9px] md:text-xs leading-snug">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div className="w-full max-w-lg space-y-4">
                <h2 className="text-[#388e6e] font-bold text-lg text-center">
                  How It Works
                </h2>
                <div className="flex items-start justify-between">
                  {[
                    { n: "1", t: "Start Recording", d: "Begin your lecture normally" },
                    { n: "2", t: "AI Listens", d: "Questions auto-generate" },
                    { n: "3", t: "Students Engage", d: "Real-time check-ins appear" },
                  ].map((s, i) => (
                    <div key={s.n} className="flex items-start gap-2">
                      {i > 0 && (
                        <span className="text-[#388e6e] mt-1 mr-1 text-lg">→</span>
                      )}
                      <div className="text-center space-y-1">
                        <div className="w-8 h-8 rounded-full bg-[#388e6e] flex items-center justify-center mx-auto text-black font-bold text-sm">
                          {s.n}
                        </div>
                        <p className="text-white font-bold text-xs md:text-sm">{s.t}</p>
                        <p className="text-[#666] text-[9px] md:text-xs">{s.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom bar */}
              <div className="w-full bg-[#388e6e] rounded-md py-2 text-center">
                <span className="text-black font-bold text-sm md:text-base">
                  www.edvana.dev
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== PAGE 2 — BACK ===== */}
        <div
          className="bg-black rounded-lg overflow-hidden shadow-2xl"
          style={{ aspectRatio: "8.5 / 11" }}
        >
          <div className="h-full flex flex-col">
            <div className="h-2 bg-[#388e6e] shrink-0" />

            <div className="flex-1 flex flex-col items-center justify-between px-8 py-10 md:px-14 md:py-14">
              {/* Testimonial */}
              <div className="w-full space-y-4">
                <h2 className="text-white font-bold text-xl text-center">
                  What Educators Say
                </h2>
                <div className="bg-[#1a1a1a] rounded-lg border-l-4 border-[#388e6e] px-6 py-5">
                  <p className="text-[#ededed] italic text-sm md:text-base">
                    "I demoed this. It has tremendous promise for student
                    engagement."
                  </p>
                  <p className="text-[#666] text-xs mt-2">
                    — University Professor
                  </p>
                </div>
              </div>

              {/* Built for */}
              <div className="w-full max-w-lg space-y-4">
                <h2 className="text-[#388e6e] font-bold text-lg text-center">
                  Built For
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: "🏫", t: "Universities", d: "Large lectures, seminars" },
                    { icon: "🔬", t: "STEM Courses", d: "Math, science, engineering" },
                    { icon: "🏢", t: "Corporate", d: "Training & workshops" },
                    { icon: "🌐", t: "Remote", d: "Hybrid & online classes" },
                  ].map((c) => (
                    <div
                      key={c.t}
                      className="bg-[#1a1a1a] rounded-lg p-4 flex items-center gap-3"
                    >
                      <span className="text-xl">{c.icon}</span>
                      <div>
                        <p className="text-white font-bold text-xs md:text-sm">{c.t}</p>
                        <p className="text-[#666] text-[10px] md:text-xs">{c.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="w-full space-y-4">
                <h2 className="text-[#388e6e] font-bold text-lg text-center">
                  By the Numbers
                </h2>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { v: "< 30s", l: "Setup Time" },
                    { v: "100%", l: "Browser-Based" },
                    { v: "Real-Time", l: "AI Questions" },
                    { v: "Zero", l: "Accounts Required" },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-[#388e6e] font-bold text-lg md:text-2xl">
                        {s.v}
                      </p>
                      <p className="text-[#ededed] text-[9px] md:text-xs">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* QR placeholder + contact */}
              <div className="flex flex-col items-center space-y-3">
                <div className="w-28 h-28 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-[#666] text-xs font-semibold text-center leading-tight">
                    QR CODE
                    <br />
                    PLACEHOLDER
                  </span>
                </div>
                <p className="text-[#ededed] text-xs">Scan to get started</p>
                <p className="text-[#388e6e] font-bold text-xs md:text-sm">
                  johnathan@edvana.dev &nbsp;•&nbsp; www.edvana.dev
                </p>
                <p className="text-[#388e6e] font-bold text-xs md:text-sm">
                  (516) 736-2517
                </p>
              </div>

              {/* Bottom bar with logo */}
              <div className="w-full bg-[#388e6e] rounded-md py-2 flex justify-center">
                <img
                  src={edvanaLogo}
                  alt="Edvana logo"
                  className="h-7 object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoothFlyer;
