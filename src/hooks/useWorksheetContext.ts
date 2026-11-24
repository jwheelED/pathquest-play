import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorksheetItems, type WorksheetItem } from "@/components/instructor/WorksheetItemsPanel";

export interface WorksheetSheet {
  id: string;
  title: string;
}

const storageKey = (courseId: string) => `edvana.activeWorksheet.${courseId}`;

/** Course worksheets, the pinned one for today, and its numbered items. */
export function useWorksheetContext(courseId: string | null | undefined) {
  const [activeId, setActiveIdState] = useState<string | null>(null);

  useEffect(() => {
    setActiveIdState(courseId ? localStorage.getItem(storageKey(courseId)) : null);
  }, [courseId]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (!courseId) return;
    if (id) localStorage.setItem(storageKey(courseId), id);
    else localStorage.removeItem(storageKey(courseId));
  }, [courseId]);

  const { data: sheets = [] } = useQuery({
    queryKey: ["course-worksheets", courseId],
    enabled: !!courseId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<WorksheetSheet[]> => {
      const { data, error } = await supabase
        .from("lecture_materials")
        .select("id, title")
        .eq("course_id", courseId as string)
        .eq("is_worksheet", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorksheetSheet[];
    },
  });

  // A saved pick that is no longer a worksheet is ignored; with exactly one
  // worksheet in the course it is used automatically so no pick is needed.
  const chosen = sheets.find((s) => s.id === activeId) ?? null;
  const activeSheet = chosen ?? (sheets.length === 1 ? sheets[0] : null);
  const effectiveId = activeSheet?.id ?? null;

  const { data: items = [] } = useQuery({
    queryKey: ["worksheet-items", effectiveId],
    enabled: !!effectiveId,
    queryFn: () => fetchWorksheetItems(effectiveId as string),
  });

  return { sheets, activeSheet, setActiveId, items: activeSheet ? items : ([] as WorksheetItem[]) };
}
