import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Mic, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveCopilotHeroProps {
  isListening: boolean;
  autoQuestionEnabled: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleAutoQuestion: (enabled: boolean) => void;
}

export function LiveCopilotHero({
  isListening,
  autoQuestionEnabled,
  onStartListening,
  onStopListening,
  onToggleAutoQuestion,
}: LiveCopilotHeroProps) {
  return (
    <div className="command-hero p-6 lg:p-8">
      {/* Eyebrow */}
      <span className="section-eyebrow">Live Copilot</span>

      {/* Headline */}
      <h1 className="text-2xl lg:text-[1.75rem] font-semibold text-charcoal tracking-tight mt-2 mb-3">
        {isListening 
          ? "Listening to your lecture..." 
          : "Ready to listen for your next live question"
        }
      </h1>

      {/* Body */}
      <p className="text-sm text-charcoal-muted leading-relaxed mb-6 max-w-xl">
        {isListening
          ? "Edvana is analyzing your lecture in real time. Questions will appear when the copilot detects a teachable moment."
          : "Edvana listens while you teach and prepares send-ready understanding checks in real time, so you can respond to the room without breaking flow."
        }
      </p>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        {/* Primary CTA */}
        {isListening ? (
          <Button
            onClick={onStopListening}
            className={cn(
              "rounded-full px-6 h-12 gap-2.5 font-medium text-base",
              "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
              "transition-all duration-200 hover:shadow-md"
            )}
          >
            <div className="relative">
              <Mic className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
            Stop Listening
          </Button>
        ) : (
          <Button
            onClick={onStartListening}
            className={cn(
              "rounded-full px-6 h-12 gap-2.5 font-medium text-base",
              "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
              "transition-all duration-200 hover:shadow-md"
            )}
          >
            <Mic className="w-5 h-5" />
            Start Listening
          </Button>
        )}

        {/* Auto-question toggle */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
          <Sparkles className="w-4 h-4 text-charcoal-subtle" />
          <span className="text-sm font-medium text-charcoal">Auto-question mode</span>
          <Switch
            checked={autoQuestionEnabled}
            onCheckedChange={onToggleAutoQuestion}
            className="data-[state=checked]:bg-emerald-600"
          />
        </div>
      </div>

      {/* Supporting micro-line */}
      <p className="text-xs text-charcoal-subtle">
        You review every check-in before anything is sent.
      </p>

      {/* Listening indicator bar */}
      {isListening && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-500 rounded-full animate-pulse"
                  style={{
                    height: `${12 + Math.random() * 12}px`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-sm text-emerald-700 font-medium">
              Actively listening...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
