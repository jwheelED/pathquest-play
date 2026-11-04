import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type SessionTypeFilter = "live" | "pre_recorded" | "event";
export type DateRangePreset = "7d" | "30d" | "term" | "custom";

export interface AdminFilters {
  instructorIds: string[];
  courseIds: string[];
  sessionTypes: SessionTypeFilter[];
  dateRange: DateRangePreset;
  fromDate: string | null; // ISO date (yyyy-mm-dd) when dateRange === 'custom'
  toDate: string | null;
  presetId: string | null;
}

const DEFAULT_FILTERS: AdminFilters = {
  instructorIds: [],
  courseIds: [],
  sessionTypes: [],
  dateRange: "30d",
  fromDate: null,
  toDate: null,
  presetId: null,
};

function parseList(val: string | null): string[] {
  if (!val) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getDateRangeBounds(
  range: DateRangePreset,
  fromDate: string | null,
  toDate: string | null,
): { from: Date; to: Date } {
  const now = new Date();
  const to = toDate ? new Date(toDate) : now;
  if (range === "custom" && fromDate) {
    return { from: new Date(fromDate), to };
  }
  const days = range === "7d" ? 7 : range === "term" ? 120 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to };
}

export function useAdminFilters() {
  const [params, setParams] = useSearchParams();

  const filters: AdminFilters = useMemo(() => {
    const dr = (params.get("range") as DateRangePreset) || DEFAULT_FILTERS.dateRange;
    return {
      instructorIds: parseList(params.get("instructor")),
      courseIds: parseList(params.get("course")),
      sessionTypes: parseList(params.get("type")) as SessionTypeFilter[],
      dateRange: ["7d", "30d", "term", "custom"].includes(dr) ? dr : "30d",
      fromDate: params.get("from"),
      toDate: params.get("to"),
      presetId: params.get("preset"),
    };
  }, [params]);

  const setFilters = useCallback(
    (next: Partial<AdminFilters>) => {
      const merged = { ...filters, ...next };
      const newParams = new URLSearchParams(params);
      const setOrDelete = (key: string, value: string | null | undefined) => {
        if (value && value.length > 0) newParams.set(key, value);
        else newParams.delete(key);
      };
      setOrDelete("instructor", merged.instructorIds.join(","));
      setOrDelete("course", merged.courseIds.join(","));
      setOrDelete("type", merged.sessionTypes.join(","));
      setOrDelete("range", merged.dateRange === "30d" ? null : merged.dateRange);
      setOrDelete("from", merged.dateRange === "custom" ? merged.fromDate : null);
      setOrDelete("to", merged.dateRange === "custom" ? merged.toDate : null);
      setOrDelete("preset", merged.presetId);
      setParams(newParams, { replace: true });
    },
    [filters, params, setParams],
  );

  const clearFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const activeCount =
    filters.instructorIds.length +
    filters.courseIds.length +
    filters.sessionTypes.length +
    (filters.dateRange !== "30d" ? 1 : 0);

  const bounds = useMemo(
    () => getDateRangeBounds(filters.dateRange, filters.fromDate, filters.toDate),
    [filters.dateRange, filters.fromDate, filters.toDate],
  );

  return { filters, setFilters, clearFilters, activeCount, bounds };
}

export const DEFAULT_ADMIN_FILTERS = DEFAULT_FILTERS;
