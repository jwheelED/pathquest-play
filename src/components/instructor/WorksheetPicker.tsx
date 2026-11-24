import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useWorksheetContext } from "@/hooks/useWorksheetContext";

/** Lets the instructor choose which uploaded worksheet "send question N" uses. */
export function WorksheetPicker({ courseId, className }: { courseId: string | null | undefined; className?: string }) {
  const { sheets, activeSheet, setActiveId } = useWorksheetContext(courseId);

  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3 bg-card border border-border rounded-xl", className)}>
      <div className="min-w-0 flex items-start gap-2.5">
        <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <Label htmlFor="active-worksheet-picker" className="text-sm font-semibold text-foreground">Active worksheet</Label>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {sheets.length > 0
              ? "Say “send question 2” to send it straight from the sheet"
              : "No worksheets for this course yet. Upload one in Materials and turn on its worksheet toggle."}
          </p>
        </div>
      </div>
      {sheets.length > 0 && (
        <select
          id="active-worksheet-picker"
          value={activeSheet?.id ?? ""}
          onChange={(e) => setActiveId(e.target.value || null)}
          className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="">None</option>
          {sheets.map((sh) => (
            <option key={sh.id} value={sh.id}>{sh.title}</option>
          ))}
        </select>
      )}
    </div>
  );
}
