import { Button } from "@/components/ui/button";
import { Monitor, Presentation, Library, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface LiveToolsSectionProps {
  onNavigate: (tab: string) => void;
}

export function LiveToolsSection({ onNavigate }: LiveToolsSectionProps) {
  const navigate = useNavigate();

  const tools = [
    {
      label: "Open Presenter View",
      icon: Monitor,
      onClick: () => navigate("/instructor/presenter"),
    },
    {
      label: "Present Slides",
      icon: Presentation,
      onClick: () => navigate("/instructor/slides"),
    },
    {
      label: "Open Question Bank",
      icon: Library,
      onClick: () => onNavigate("question-bank"),
    },
    {
      label: "Review Session Summary",
      icon: FileText,
      onClick: () => onNavigate("summaries"),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Eyebrow */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
        Tools
      </span>

      {/* Tool buttons */}
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.label}
              variant="outline"
              onClick={tool.onClick}
              className={cn(
                "rounded-full h-9 px-4 gap-2 text-sm font-medium",
                "border-slate-200 text-charcoal-muted hover:text-charcoal hover:bg-slate-50 hover:border-slate-300",
                "transition-all duration-200"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tool.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
