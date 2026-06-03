import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronDown, X, Filter, Users, BookOpen, CalendarRange, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminFilters, type SessionTypeFilter, type DateRangePreset } from "@/hooks/useAdminFilters";
import { SavedPresetsMenu } from "./SavedPresetsMenu";

interface Option {
  value: string;
  label: string;
}

interface AdminFilterBarProps {
  orgId: string | null;
  instructorIds: string[];
}

const SESSION_TYPE_OPTIONS: { value: SessionTypeFilter; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "pre_recorded", label: "Pre-recorded" },
  { value: "event", label: "Scheduled event" },
];

const DATE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "term", label: "This term" },
  { value: "custom", label: "Custom range" },
];

export function AdminFilterBar({ orgId, instructorIds }: AdminFilterBarProps) {
  const { filters, setFilters, clearFilters, activeCount } = useAdminFilters();
  const [instructorOptions, setInstructorOptions] = useState<Option[]>([]);
  const [courseOptions, setCourseOptions] = useState<Option[]>([]);

  useEffect(() => {
    if (!orgId || instructorIds.length === 0) {
      setInstructorOptions([]);
      setCourseOptions([]);
      return;
    }
    (async () => {
      const [{ data: profs }, { data: courses }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", instructorIds),
        supabase
          .from("courses")
          .select("id, title")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("title"),
      ]);
      setInstructorOptions(
        (profs || []).map((p: any) => ({ value: p.id, label: p.full_name || "Unnamed" })),
      );
      setCourseOptions((courses || []).map((c: any) => ({ value: c.id, label: c.title })));
    })();
  }, [orgId, instructorIds.join(",")]);

  const dateLabel = DATE_OPTIONS.find((o) => o.value === filters.dateRange)?.label ?? "Last 30 days";

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3 sticky top-0 z-10 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </div>

        <MultiSelect
          icon={<Users className="w-3.5 h-3.5" />}
          placeholder="All instructors"
          options={instructorOptions}
          selected={filters.instructorIds}
          onChange={(v) => setFilters({ instructorIds: v, presetId: null })}
        />

        <MultiSelect
          icon={<BookOpen className="w-3.5 h-3.5" />}
          placeholder="All courses"
          options={courseOptions}
          selected={filters.courseIds}
          onChange={(v) => setFilters({ courseIds: v, presetId: null })}
        />

        <MultiSelect
          icon={<Tv className="w-3.5 h-3.5" />}
          placeholder="All session types"
          options={SESSION_TYPE_OPTIONS}
          selected={filters.sessionTypes}
          onChange={(v) =>
            setFilters({ sessionTypes: v as SessionTypeFilter[], presetId: null })
          }
        />

        <Select
          value={filters.dateRange}
          onValueChange={(v) => setFilters({ dateRange: v as DateRangePreset, presetId: null })}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" />
            <SelectValue>{dateLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <SavedPresetsMenu />

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" />
            Clear ({activeCount})
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.instructorIds.map((id) => {
            const opt = instructorOptions.find((o) => o.value === id);
            return (
              <Chip
                key={`i-${id}`}
                label={opt?.label ?? id}
                onRemove={() =>
                  setFilters({
                    instructorIds: filters.instructorIds.filter((x) => x !== id),
                    presetId: null,
                  })
                }
              />
            );
          })}
          {filters.courseIds.map((id) => {
            const opt = courseOptions.find((o) => o.value === id);
            return (
              <Chip
                key={`c-${id}`}
                label={opt?.label ?? id}
                onRemove={() =>
                  setFilters({
                    courseIds: filters.courseIds.filter((x) => x !== id),
                    presetId: null,
                  })
                }
              />
            );
          })}
          {filters.sessionTypes.map((t) => {
            const opt = SESSION_TYPE_OPTIONS.find((o) => o.value === t);
            return (
              <Chip
                key={`t-${t}`}
                label={opt?.label ?? t}
                onRemove={() =>
                  setFilters({
                    sessionTypes: filters.sessionTypes.filter((x) => x !== t),
                    presetId: null,
                  })
                }
              />
            );
          })}
          {filters.dateRange !== "30d" && <Chip label={dateLabel} />}
        </div>
      )}
    </div>
  );
}

function MultiSelect({
  icon,
  placeholder,
  options,
  selected,
  onChange,
}: {
  icon: React.ReactNode;
  placeholder: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter((s) => s !== val));
    else onChange([...selected, val]);
  };
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `${selected.length} selected`
        : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          {icon}
          <span className="text-xs">{label}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = selected.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    onSelect={() => toggle(o.value)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-input",
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:bg-primary/20 rounded-full p-0.5">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
