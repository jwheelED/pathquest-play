import { Radio, Mic, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionReadinessProps {
  isLive: boolean;
  micConnected: boolean;
  participantCount: number;
  autoQuestionEnabled: boolean;
}

export function SessionReadiness({
  isLive,
  micConnected,
  participantCount,
  autoQuestionEnabled,
}: SessionReadinessProps) {
  const cards = [
    {
      title: "Session state",
      value: isLive ? "Live now" : "Ready to go live",
      icon: Radio,
      status: isLive ? "active" : "ready",
    },
    {
      title: "Mic status",
      value: micConnected ? "Connected" : "Not connected",
      icon: Mic,
      status: micConnected ? "ready" : "warning",
    },
    {
      title: "Participants connected",
      value: `${participantCount} joined`,
      icon: Users,
      status: participantCount > 0 ? "active" : "neutral",
    },
    {
      title: "Auto-question mode",
      value: autoQuestionEnabled ? "Enabled" : "Disabled",
      icon: Sparkles,
      status: autoQuestionEnabled ? "ready" : "neutral",
    },
  ];

  const statusColors = {
    active: {
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      icon: "text-emerald-600",
      dot: "bg-emerald-500",
    },
    ready: {
      bg: "bg-slate-50",
      border: "border-slate-100",
      icon: "text-charcoal-muted",
      dot: "bg-emerald-400",
    },
    warning: {
      bg: "bg-amber-50",
      border: "border-amber-100",
      icon: "text-amber-600",
      dot: "bg-amber-400",
    },
    neutral: {
      bg: "bg-slate-50",
      border: "border-slate-100",
      icon: "text-charcoal-subtle",
      dot: "bg-slate-300",
    },
  };

  return (
    <div className="space-y-3">
      {/* Eyebrow */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
        Session Readiness
      </span>

      {/* Readiness cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map((card) => {
          const Icon = card.icon;
          const colors = statusColors[card.status as keyof typeof statusColors];

          return (
            <div
              key={card.title}
              className={cn(
                "rounded-xl px-3.5 py-3 border transition-colors",
                colors.bg,
                colors.border
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={cn("w-3.5 h-3.5", colors.icon)} />
                <span className="text-[10px] font-medium text-charcoal-subtle uppercase tracking-wide">
                  {card.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
                <span className="text-sm font-medium text-charcoal">
                  {card.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
