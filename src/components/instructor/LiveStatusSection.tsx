import { Button } from "@/components/ui/button";
import { Radio, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveStatusSectionProps {
  onStartLive: () => void;
  onViewSummary: () => void;
}

export function LiveStatusSection({ onStartLive, onViewSummary }: LiveStatusSectionProps) {
  return (
    <div className="command-card p-6">
      {/* Eyebrow */}
      <span className="section-eyebrow">Live Status</span>
      
      {/* Headline */}
      <h2 className="section-headline mt-2 mb-3">
        Ready for the next check-in
      </h2>
      
      {/* Body */}
      <p className="text-sm text-charcoal-muted leading-relaxed mb-5 max-w-md">
        Edvana is prepared to support your next live understanding check. Start the session, present slides, or return to the live room.
      </p>
      
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button 
          onClick={onStartLive}
          className={cn(
            "rounded-full px-5 h-10 gap-2 font-medium text-sm",
            "bg-emerald-600 hover:bg-emerald-700 text-white",
            "transition-all duration-200"
          )}
        >
          <Radio className="w-4 h-4" />
          Go to Live Session
        </Button>
        
        <Button 
          variant="ghost"
          onClick={onViewSummary}
          className={cn(
            "rounded-full px-4 h-10 gap-2 font-medium text-sm",
            "text-charcoal-muted hover:text-charcoal hover:bg-slate-50",
            "transition-all duration-200"
          )}
        >
          <FileText className="w-4 h-4" />
          View Last Summary
        </Button>
      </div>
    </div>
  );
}
