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
      label: "Presenter View",
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
    <div className="space-y-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        Tools
      </span>

      <div className="bg-white border border-neutral-100 rounded-2xl px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Button
                key={tool.label}
                variant="ghost"
                onClick={tool.onClick}
                className={cn(
                  "rounded-full h-8 px-3.5 gap-1.5 text-xs font-medium",
                  "text-neutral-500 hover:text-[#1a1a1a] hover:bg-neutral-50",
                  "border border-neutral-100 hover:border-neutral-200",
                  "transition-all duration-150"
                )}
              >
                <Icon className="w-3 h-3" />
                {tool.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
