import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Bookmark, Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAdminFilters, DEFAULT_ADMIN_FILTERS, type AdminFilters } from "@/hooks/useAdminFilters";

interface Preset {
  id: string;
  name: string;
  filters: AdminFilters;
}

export function SavedPresetsMenu() {
  const { filters, setFilters, activeCount } = useAdminFilters();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("admin_dashboard_presets" as any)
      .select("id, name, filters")
      .order("created_at", { ascending: false });
    setPresets((data as any) || []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("admin_dashboard_presets" as any).insert({
      admin_id: user.id,
      name: name.trim(),
      filters: filters as any,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not save view");
      return;
    }
    toast.success(`Saved view "${name.trim()}"`);
    setName("");
    setSaveOpen(false);
    load();
  };

  const handleDelete = async (id: string, n: string) => {
    const { error } = await supabase
      .from("admin_dashboard_presets" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Could not delete");
      return;
    }
    toast.success(`Deleted "${n}"`);
    load();
  };

  const apply = (p: Preset) => {
    setFilters({ ...DEFAULT_ADMIN_FILTERS, ...p.filters });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Bookmark className="w-3.5 h-3.5" />
            <span className="text-xs">My views</span>
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {presets.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No saved views yet. Apply filters, then save them.
            </div>
          ) : (
            presets.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={(e) => {
                  e.preventDefault();
                  apply(p);
                }}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{p.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p.id, p.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded p-1"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSaveOpen(true);
            }}
            disabled={activeCount === 0}
          >
            <Plus className="w-3.5 h-3.5 mr-2" />
            Save current filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder='e.g. "BIO 101 — last week"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? "Saving..." : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
