import { SMART_PRESETS, type SmartPreset } from "@/lib/adminSmartPresets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingDown,
  Clock,
  Brain,
  CalendarRange,
  Calendar,
  Sparkles,
} from "lucide-react";
import { useAdminFilters, DEFAULT_ADMIN_FILTERS } from "@/hooks/useAdminFilters";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  TrendingDown,
  Clock,
  Brain,
  CalendarRange,
  Calendar,
};

export function SmartPresetChips() {
  const { filters, setFilters } = useAdminFilters();

  const apply = (preset: SmartPreset) => {
    setFilters({
      ...DEFAULT_ADMIN_FILTERS,
      ...preset.filters,
      presetId: preset.id,
    });
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        Quick views
      </div>
      {SMART_PRESETS.map((p) => {
        const Icon = ICONS[p.icon] || Sparkles;
        const active = filters.presetId === p.id;
        return (
          <Button
            key={p.id}
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={() => apply(p)}
            className={cn(
              "h-8 gap-1.5 whitespace-nowrap text-xs",
              active && "bg-primary text-primary-foreground",
            )}
            title={p.description}
          >
            <Icon className="w-3.5 h-3.5" />
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}
