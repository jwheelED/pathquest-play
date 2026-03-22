import { Mic, Sparkles, Send, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    title: "Speak naturally",
    description: "Teach, explain, or present as you normally would.",
    icon: Mic,
    color: "emerald",
  },
  {
    number: 2,
    title: "Edvana drafts a check-in",
    description: "The copilot prepares a contextual question from what you just said.",
    icon: Sparkles,
    color: "sky",
  },
  {
    number: 3,
    title: "You review and send",
    description: "Stay in control and send only when the moment is right.",
    icon: Send,
    color: "violet",
  },
  {
    number: 4,
    title: "See the room instantly",
    description: "Watch responses surface while the session is still alive.",
    icon: BarChart3,
    color: "amber",
  },
];

const colorClasses = {
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    icon: "text-emerald-600",
    number: "text-emerald-600",
  },
  sky: {
    bg: "bg-sky-50",
    border: "border-sky-100",
    icon: "text-sky-600",
    number: "text-sky-600",
  },
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-100",
    icon: "text-violet-600",
    number: "text-violet-600",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-100",
    icon: "text-amber-600",
    number: "text-amber-600",
  },
};

export function HowItWorksSection() {
  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <span className="section-eyebrow opacity-70">How It Works In Session</span>
        <h2 className="text-lg font-semibold text-charcoal mt-1.5">
          From speaking to room signal in four steps
        </h2>
      </div>

      {/* Steps grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          const colors = colorClasses[step.color as keyof typeof colorClasses];
          
          return (
            <div
              key={step.number}
              className="signal-card p-5 relative"
            >
              {/* Step number + icon */}
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center border",
                  colors.bg,
                  colors.border
                )}>
                  <Icon className={cn("w-4 h-4", colors.icon)} />
                </div>
                <span className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  colors.number
                )}>
                  Step {step.number}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-semibold text-charcoal mb-1.5">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-xs text-charcoal-muted leading-relaxed">
                {step.description}
              </p>

              {/* Connector line (hidden on mobile and last item) */}
              {step.number < 4 && (
                <div className="hidden lg:block absolute top-1/2 -right-2 w-4 h-px bg-slate-200" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
