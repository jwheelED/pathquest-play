import { BarChart3 } from "lucide-react";

interface LiveResponsesEmptyProps {
  hasActiveSession: boolean;
}

export function LiveResponsesEmpty({ hasActiveSession }: LiveResponsesEmptyProps) {
  return (
    <div className="space-y-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        Live Responses
      </span>

      <div className="bg-white border border-neutral-100 rounded-2xl px-6 py-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-4 h-4 text-neutral-300" />
        </div>
        <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">
          No audience checks sent yet
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed max-w-xs mx-auto">
          Once you send your first live check, Edvana will show room response
          patterns here in real time.
        </p>
      </div>
    </div>
  );
}
