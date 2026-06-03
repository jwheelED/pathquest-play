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

export const SMART_PRESETS: SmartPreset[] = [
  {
    id: "at-risk-week",
    label: "At-risk this week",
    description: "Students flagged as high/critical risk in the last 7 days",
    icon: "AlertTriangle",
    filters: { dateRange: "7d" },
    refinement: { riskLevels: ["critical", "high"] },
  },
  {
    id: "underperforming-sessions",
    label: "Underperforming sessions",
    description: "Questions with <50% correct rate over the last 30 days",
    icon: "TrendingDown",
    filters: { dateRange: "30d" },
    refinement: { maxCorrectRate: 50 },
  },
  {
    id: "inactive-students",
    label: "Inactive students",
    description: "Students with no activity in 7+ days",
    icon: "Clock",
    filters: {},
    refinement: { inactiveDays: 7 },
  },
  {
    id: "high-confidence-misconceptions",
    label: "Confident misconceptions",
    description: "Concepts where students are confidently wrong",
    icon: "Brain",
    filters: { dateRange: "30d" },
    refinement: { minConfidentWrong: 3 },
  },
  {
    id: "this-term",
    label: "This term",
    description: "All activity in the current term (~4 months)",
    icon: "CalendarRange",
    filters: { dateRange: "term" },
  },
  {
    id: "last-7d",
    label: "Last 7 days",
    description: "Snapshot of the most recent week",
    icon: "Calendar",
    filters: { dateRange: "7d" },
  },
];
