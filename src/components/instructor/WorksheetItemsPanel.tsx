import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Sparkles, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

export interface WorksheetItem {
  id: string;
  material_id: string;
  number: number;
  part: string;
  prompt: string;
  question_type: string;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  ai_filled: boolean;
  edited: boolean;
}

export const itemLabel = (i: { number: number; part: string }) => `Q${i.number}${i.part}`;

// worksheet_items is newer than the generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const itemsTable = () => (supabase as any).from("worksheet_items");

export async function fetchWorksheetItems(materialId: string): Promise<WorksheetItem[]> {
  const { data, error } = await itemsTable().select("*").eq("material_id", materialId).order("number").order("part");
  if (error) throw error;
  return (data ?? []) as WorksheetItem[];
}

function ItemEditor({ item, onSaved }: { item: WorksheetItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(item.prompt);
  const [options, setOptions] = useState<string[]>(item.options ?? []);
  const [answer, setAnswer] = useState(item.correct_answer ?? "");
  const [saving, setSaving] = useState(false);
  const isMcq = item.question_type === "multiple_choice";

  const save = async () => {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (isMcq && !cleaned.includes(answer.trim())) {
      toast.error("The correct answer must match one of the choices.");
      return;
    }
    setSaving(true);
    const { error } = await itemsTable()
      .update({ prompt: prompt.trim(), options: isMcq ? cleaned : null, correct_answer: answer.trim(), edited: true })
      .eq("id", item.id);
    setSaving(false);
    if (error) { toast.error("Couldn't save this question."); return; }
    setEditing(false);
    onSaved();
  };

  if (!editing) {
    return (
      <div className="rounded-lg border border-border p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <Badge variant="outline" className="text-[10px] shrink-0">{itemLabel(item)}</Badge>
          <p className="text-xs text-foreground flex-1">{item.prompt}</p>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit ${itemLabel(item)}`} onClick={() => setEditing(true)}>
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
        {isMcq && item.options && (
          <ul className="text-xs text-muted-foreground pl-1 space-y-0.5">
            {item.options.map((o) => (
              <li key={o} className={o === item.correct_answer ? "text-primary font-medium" : ""}>
                {o === item.correct_answer ? "✓ " : "• "}{o}
              </li>
            ))}
          </ul>
        )}
        {!isMcq && item.correct_answer && <p className="text-xs text-muted-foreground">Answer: {item.correct_answer}</p>}
        {item.ai_filled && !item.edited && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" /> Answer written by AI — check it</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 p-3 space-y-2">
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="text-xs" aria-label="Question" />
      {isMcq && options.map((o, idx) => (
        <Input key={idx} value={o} className="h-8 text-xs" aria-label={`Choice ${idx + 1}`}
          onChange={(e) => setOptions(options.map((x, j) => (j === idx ? e.target.value : x)))} />
      ))}
      <Input value={answer} onChange={(e) => setAnswer(e.target.value)} className="h-8 text-xs" placeholder="Correct answer" aria-label="Correct answer" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}><Check className="w-3 h-3 mr-1" />Save</Button>
      </div>
    </div>
  );
}

export function WorksheetItemsPanel({ materialId, isWorksheet, onToggle }: {
  materialId: string;
  isWorksheet: boolean;
  onToggle: (on: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["worksheet-items", materialId],
    queryFn: () => fetchWorksheetItems(materialId),
    enabled: isWorksheet,
  });

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center gap-2">
        <Switch id={`ws-${materialId}`} checked={isWorksheet} disabled={busy}
          onCheckedChange={async (v) => { setBusy(true); try { await onToggle(v); } finally { setBusy(false); } }} />
        <Label htmlFor={`ws-${materialId}`} className="text-xs cursor-pointer">Worksheet</Label>
        {isWorksheet && items.length > 0 && (
          <button type="button" className="ml-1 text-xs text-primary flex items-center gap-0.5" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {items.length} question{items.length !== 1 ? "s" : ""}
          </button>
        )}
        {busy && <span className="text-xs text-muted-foreground">Working…</span>}
      </div>
      {isWorksheet && open && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">In a live session, say “send question 2” to send one instantly.</p>
          {items.map((i) => (
            <ItemEditor key={i.id} item={i} onSaved={() => queryClient.invalidateQueries({ queryKey: ["worksheet-items", materialId] })} />
          ))}
        </div>
      )}
    </div>
  );
}
