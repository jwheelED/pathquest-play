import { BarChart3 } from "lucide-react";

interface LiveResponsesEmptyProps {
  hasActiveSession: boolean;
}

export function LiveResponsesEmpty({ hasActiveSession }: LiveResponsesEmptyProps) {
  return (
    <div className="space-y-3">
      {/* Eyebrow */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
        Live Responses
      </span>

      {/* Empty state card */}
      <div className="command-card p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-5 h-5 text-charcoal-subtle" />
        </div>
        
        <h3 className="text-base font-semibold text-charcoal mb-2">
          No check-ins sent yet
        </h3>
        
        <p className="text-sm text-charcoal-muted leading-relaxed max-w-sm mx-auto">
          {hasActiveSession
            ? "Send a live check-in to see room response patterns here in real time."
            : "Once you send your first live check-in, Edvana will show room response patterns here in real time."
          }
        </p>
      </div>
    </div>
  );
}
