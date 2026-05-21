import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Accessibility,
  Keyboard,
  Captions,
  Eye,
  Contrast,
  MousePointer2,
  MessageCircle,
} from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const AccessibilityStatement = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img
            src={edvanaLogo}
            alt="Edvana"
            className="h-8 cursor-pointer"
            onClick={() => navigate("/")}
          />
          <Button onClick={() => navigate("/")} variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Accessibility className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Accessibility Statement
            </h1>
            <p className="text-muted-foreground">
              Edvana is built to be usable by everyone. Last updated: May 21, 2026.
            </p>
          </div>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-foreground leading-relaxed">
              Edvana targets conformance with{" "}
              <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong>.
              Our sessions, dashboards, and live participant experiences are
              designed and tested so that learners and instructors who use
              keyboards, screen readers, captions, or magnification can
              participate fully.
            </p>
          </CardContent>
        </Card>

        {/* Feature highlights */}
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {[
            {
              icon: Keyboard,
              title: "Full keyboard support",
              desc: "Every interactive element — answer choices, confidence bets, navigation, modals — is reachable with Tab, operable with Enter/Space, and dismissible with Esc.",
            },
            {
              icon: Captions,
              title: "Live captions & transcripts",
              desc: "Live sessions stream real-time captions powered by Deepgram. Full session transcripts remain available afterwards for review.",
            },
            {
              icon: Eye,
              title: "Screen reader compatible",
              desc: "Built on Radix UI primitives with semantic landmarks, ARIA labels, and live regions. Tested with NVDA, JAWS, and VoiceOver.",
            },
            {
              icon: Contrast,
              title: "WCAG-compliant contrast",
              desc: "Text meets 4.5:1 and UI components (borders, icons, focus rings) meet 3:1 contrast against adjacent surfaces in both light and dark themes.",
            },
            {
              icon: MousePointer2,
              title: "Visible focus & large targets",
              desc: "All focusable elements show a 2px focus ring. Tap targets meet the 44×44 px minimum on mobile.",
            },
            {
              icon: Accessibility,
              title: "Skip links & landmarks",
              desc: "A 'Skip to main content' link appears on focus, and pages use a single <main> landmark plus a logical heading hierarchy.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground mb-1">
                      {title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem value="keyboard" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Keyboard shortcuts
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2 pb-4">
              <p><kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Tab</kbd> / <kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Shift+Tab</kbd> — Move forward / backward through controls.</p>
              <p><kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Enter</kbd> / <kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Space</kbd> — Activate the focused button or option.</p>
              <p><kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Esc</kbd> — Close any open dialog, popover, or menu.</p>
              <p><kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">1</kbd>–<kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">4</kbd> — Select MCQ choices A–D during a live session.</p>
              <p><kbd className="px-2 py-0.5 rounded border bg-muted text-foreground text-xs">Arrow keys</kbd> — Navigate confidence-bet sliders and option groups.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="captions" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Captions, transcripts &amp; media
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2 pb-4">
              <p>
                Live sessions transcribe instructor audio in real time and
                broadcast captions to every connected participant. Captions
                appear in the Live Transcript panel on each participant's
                dashboard.
              </p>
              <p>
                Pre-recorded sessions display synchronized captions inline with
                the player, and the full transcript is searchable after the
                session ends.
              </p>
              <p>
                Participants can adjust browser font size and use system-level
                caption styling without breaking the layout.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="screen-readers" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Screen reader compatibility
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2 pb-4">
              <p>
                Edvana is tested with NVDA on Windows, VoiceOver on macOS/iOS,
                and TalkBack on Android. We use Radix UI primitives, which
                provide robust ARIA semantics out of the box.
              </p>
              <p>
                Dynamic events — new questions appearing, answer feedback, XP
                changes, session start/stop — are announced through ARIA live
                regions so screen reader users hear the same updates sighted
                participants see.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="visual" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Visual design &amp; motion
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2 pb-4">
              <p>
                Color is never the sole way information is conveyed — correct,
                incorrect, and warning states always pair color with an icon
                and a label.
              </p>
              <p>
                We honor the <code className="text-foreground">prefers-reduced-motion</code> media query and disable
                non-essential animations for participants who request it at the
                operating system level.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="limitations" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Known limitations
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2 pb-4">
              <p>
                Embedded third-party video players (YouTube, Kaltura) inherit
                their host platform's accessibility behavior. Where instructor
                materials include scanned PDFs, the underlying document's
                accessibility depends on how it was originally produced.
              </p>
              <p>
                We're actively working on improving keyboard reordering inside
                the Question Bank and adding richer alt text generation for
                slide-based questions.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="feedback" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">
              Report an accessibility issue
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-3 pb-4">
              <p>
                If you encounter a barrier using Edvana, please tell us. We aim
                to respond within 2 business days and resolve confirmed issues
                in our next release cycle.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-primary mt-0.5" aria-hidden="true" />
                <div className="text-foreground">
                  <p><strong>Email:</strong> johnathan@edvana.dev</p>
                  <p><strong>Phone:</strong> (516) 736-2517</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>

      <footer className="py-6 px-4 border-t border-border mt-12">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>&copy; 2026 Edvana</span>
          <span className="hidden sm:inline">•</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
            Privacy Policy
          </button>
          <span className="hidden sm:inline">•</span>
          <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">
            Terms of Service
          </button>
        </div>
      </footer>
    </div>
  );
};

export default AccessibilityStatement;
