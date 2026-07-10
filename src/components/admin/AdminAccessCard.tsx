import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listOrgAdminScopes,
  setOrgAdminScopes,
  type OrgAdminRow,
  type OrgAdminScope,
} from "@/lib/orgScopesRpc";

const SCOPE_OPTIONS: { value: OrgAdminScope; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Full access + manages roles" },
  { value: "billing", label: "Billing & Usage", hint: "Hour pool & billing" },
  { value: "academic", label: "Academic Analytics", hint: "Grades & engagement" },
];

function sameScopes(a: OrgAdminScope[], b: OrgAdminScope[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((s) => setB.has(s));
}

/**
 * Owner-only card to assign billing / academic / owner scopes to the org's
 * admins. Enforcement is server-side in set_org_admin_scopes (owner-guarded);
 * this UI is a convenience surface. Renders only when the viewer is an owner.
 */
export function AdminAccessCard() {
  const [rows, setRows] = useState<OrgAdminRow[]>([]);
  const [edits, setEdits] = useState<Record<string, OrgAdminScope[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setSelfId(user?.id ?? null);
      const data = await listOrgAdminScopes();
      setRows(data);
      setEdits(Object.fromEntries(data.map((r) => [r.user_id, r.scopes])));
    } catch (error) {
      console.error("Failed to load admin access:", error);
      toast.error("Failed to load admin access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (userId: string, scope: OrgAdminScope, checked: boolean) => {
    setEdits((prev) => {
      const current = new Set(prev[userId] ?? []);
      if (checked) current.add(scope);
      else current.delete(scope);
      return { ...prev, [userId]: Array.from(current) };
    });
  };

  const save = async (userId: string) => {
    setSavingId(userId);
    try {
      await setOrgAdminScopes(userId, edits[userId] ?? []);
      toast.success("Access updated");
      await load();
    } catch (error) {
      console.error("Failed to update access:", error);
      toast.error("Failed to update access");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Admin Access
        </CardTitle>
        <CardDescription>
          Choose what each admin in your organization can see. Billing admins
          oversee the hour pool; academic admins see analytics; owners see both.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other admins in your organization yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const selected = edits[row.user_id] ?? [];
              const isSelf = row.user_id === selfId;
              const dirty = !sameScopes(selected, row.scopes);
              return (
                <div key={row.user_id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-medium">
                      {row.full_name || "Unnamed admin"}
                      {isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
                    </div>
                    <Button
                      size="sm"
                      disabled={!dirty || savingId === row.user_id}
                      onClick={() => save(row.user_id)}
                    >
                      {savingId === row.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {SCOPE_OPTIONS.map((opt) => {
                      // Prevent owners from removing their own owner scope (lockout guard).
                      const lockSelfOwner = isSelf && opt.value === "owner";
                      return (
                        <label
                          key={opt.value}
                          className="flex items-start gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.includes(opt.value)}
                            disabled={lockSelfOwner}
                            onCheckedChange={(c) => toggle(row.user_id, opt.value, c === true)}
                          />
                          <span>
                            <span className="font-medium">{opt.label}</span>
                            <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
