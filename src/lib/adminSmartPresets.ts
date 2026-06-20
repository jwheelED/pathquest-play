import type { AdminFilters } from "@/hooks/useAdminFilters";

export interface SmartPreset {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  filters: Partial<AdminFilters>;
  /** Optional client-side refinement applied AFTER global filters */
  refinement?: {
    riskLevels?: Array<"critical" | "high" | "medium">;
    minCorrectRate?: number;
    maxCorrectRate?: number;
    minConfidentWrong?: number;
    inactiveDays?: number;
  };
}

// Only include presets that map cleanly to filters available in the filter bar
// (instructorIds, courseIds, sessionTypes, dateRange). Presets requiring
// refinements that aren't exposed as filters have been removed.
export const SMART_PRESETS: SmartPreset[] = [
  {
    id: "last-7d",
    label: "Last 7 days",
    description: "Snapshot of the most recent week",
    icon: "Calendar",
    filters: { dateRange: "7d" },
  },
  {
    id: "last-30d",
    label: "Last 30 days",
    description: "Activity across the last 30 days",
    icon: "CalendarRange",
    filters: { dateRange: "30d" },
  },
  {
    id: "this-term",
    label: "This term",
    description: "All activity in the current term (~4 months)",
    icon: "CalendarRange",
    filters: { dateRange: "term" },
  },
  {
    id: "live-sessions",
    label: "Live sessions",
    description: "Only live sessions in the last 30 days",
    icon: "Tv",
    filters: { dateRange: "30d", sessionTypes: ["live"] },
  },
  {
    id: "pre-recorded",
    label: "Pre-recorded",
    description: "Only pre-recorded sessions in the last 30 days",
    icon: "Film",
    filters: { dateRange: "30d", sessionTypes: ["pre_recorded"] },
  },
  {
    id: "scheduled-events",
    label: "Scheduled events",
    description: "Only scheduled events in the last 30 days",
    icon: "CalendarClock",
    filters: { dateRange: "30d", sessionTypes: ["event"] },
  },
];
