import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, HeartHandshake, Search, BookOpen, Info, Download, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type SupportTier = "critical" | "high" | "medium";
export type CaseStatus = "open" | "contacted" | "resolved";
export type ViewerRole = "admin" | "advisor" | "instructor_of_record" | "support_staff";

export interface SupportSignal {
  label: string;
  weight: number;
  detail?: string;
}

export interface SupportCase {
  id: string;
  studentName: string;
  instructorName: string;
  signals: SupportSignal[];
  tier: SupportTier;
  score: number;
  suggestedAction: string;
  daysSinceActive: number | null;
}

interface Props {
  cases: SupportCase[];
  loading?: boolean;
  canViewIndividuals: boolean;
  /** When set to "admin"/"dean" (default), names are masked by default with role-gated Reveal. */
  viewerRole?: ViewerRole;
  viewerId?: string;
}

const STATUS_KEY = "edvana_support_case_status_v1";
const REVEAL_LOG_KEY = "edvana_support_reveal_log_v1";

function loadStatuses(): Record<string, CaseStatus> {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}"); } catch { return {}; }
}
function saveStatuses(s: Record<string, CaseStatus>) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(s));
}

function logReveal(entry: { caseId: string; viewerId?: string; viewerRole: ViewerRole; ts: number }) {
  // Server-side FERPA audit trail. The support_reveal_audit table is created by
  // the staged migration in db/proposed/; until it is applied this insert fails
  // (RLS/missing table) and we rely on the local fallback below. Cast via `as
  // any` because the table isn't in the generated types yet — drop the cast once
  // types.ts is regenerated post-migration.
  if (entry.viewerId && entry.viewerRole !== "admin") {
    void (supabase.from("support_reveal_audit") as any)
      .insert({
        case_id: entry.caseId,
        viewer_id: entry.viewerId,
        viewer_role: entry.viewerRole,
      })
      .then(({ error }: { error: unknown }) => {
        // Dormant until the migration lands; ignore the expected error.
        void error;
      });
  }

  // Local fallback: per-browser, clearable — NOT a real audit trail. Kept only
  // so reveals are still traceable in dev before the audit table exists.
  try {
    const existing = JSON.parse(localStorage.getItem(REVEAL_LOG_KEY) || "[]");
    existing.push(entry);
    localStorage.setItem(REVEAL_LOG_KEY, JSON.stringify(existing.slice(-500)));
  } catch { /* noop */ }
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Student";
  const initials = parts.map(p => p[0]?.toUpperCase() || "").join(".");
  return `Student ${initials}.`;
}

const tierMeta: Record<SupportTier, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-destructive text-destructive-foreground" },
  high: { label: "High", cls: "bg-orange-500 text-white" },
  medium: { label: "Medium", cls: "bg-yellow-500 text-yellow-950" },
};

export default function SupportQueueTable({
  cases, loading, canViewIndividuals, viewerRole = "admin", viewerId,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, CaseStatus>>(() => loadStatuses());
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  useEffect(() => { saveStatuses(statuses); }, [statuses]);

  const canReveal = viewerRole !== "admin";
  const namesMaskedByDefault = viewerRole === "admin";

  const setStatus = (id: string, status: CaseStatus) => {
    setStatuses((s) => ({ ...s, [id]: status }));
  };

  const toggleReveal = (id: string) => {
    if (!canReveal) {
      toast.error("Reveal requires advisor / instructor-of-record / support-staff role (FERPA).");
      return;
    }
    setRevealed(r => {
      const next = !r[id];
      if (next) logReveal({ caseId: id, viewerId, viewerRole, ts: Date.now() });
      return { ...r, [id]: next };
    });
  };

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      const status = statuses[c.id] || "open";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        // search on masked id too so admins can still find by initials/course
        const masked = maskName(c.studentName).toLowerCase();
        if (!c.studentName.toLowerCase().includes(q) &&
            !masked.includes(q) &&
            !c.instructorName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [cases, statuses, statusFilter, tierFilter, search]);

  const counts = useMemo(() => ({
    critical: cases.filter(c => c.tier === "critical").length,
    high: cases.filter(c => c.tier === "high").length,
    medium: cases.filter(c => c.tier === "medium").length,
    open: cases.filter(c => (statuses[c.id] || "open") === "open").length,
  }), [cases, statuses]);

  const handleExport = () => {
    const csv = [
      ["Identity", "Course context", "Tier", "Why flagged", "Suggested action", "Status"].join(","),
      ...filtered.map(c => {
        const identity = namesMaskedByDefault && !revealed[c.id]
          ? maskName(c.studentName)
          : c.studentName;
        return [
          `"${identity}"`,
          `"${c.instructorName}"`,
          c.tier,
          `"${c.signals.map(s => s.label).join("; ")}"`,
          `"${c.suggestedAction}"`,
          statuses[c.id] || "open",
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-queue-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Support queue exported");
  };

  if (!canViewIndividuals) {
    return (
      <Card className="headspace-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lock className="w-5 h-5 text-muted-foreground" />
            Individual records restricted
          </CardTitle>
          <CardDescription>
            Names are visible only to staff with documented legitimate educational interest
            (advisors, instructors of record, support staff). You can see aggregate counts by course
            above.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="headspace-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <HeartHandshake className="w-5 h-5 text-primary" />
              Support Queue
            </CardTitle>
            <CardDescription className="mt-1">
              A routing tool to get students help — not a risk-ranking engine. Every flag shows its
              full reason and a suggested next step.
              {namesMaskedByDefault && (
                <span className="block mt-1 text-xs">
                  <Lock className="w-3 h-3 inline mr-1" />
                  Identities masked for your role. Reveal is gated to advisors, instructors of record, and support staff.
                </span>
              )}
            </CardDescription>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <div className="stat-pill bg-destructive/10 text-destructive">
            <AlertTriangle className="w-4 h-4" /> {counts.critical} Critical
          </div>
          <div className="stat-pill bg-orange-500/10 text-orange-600">
            {counts.high} High
          </div>
          <div className="stat-pill bg-yellow-500/10 text-yellow-700">
            {counts.medium} Medium
          </div>
          <div className="stat-pill bg-primary/10 text-primary">
            {counts.open} Open cases
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={namesMaskedByDefault ? "Search initials or course..." : "Search student or instructor..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tiers</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground animate-pulse">
            Loading support cases...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {cases.length === 0
                ? "No students currently need support — when behavioral signals dip we'll surface them here."
                : "No cases match your filters."}
            </p>
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{namesMaskedByDefault ? "Identity (masked)" : "Student"}</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Why flagged</TableHead>
                    <TableHead>Suggested action</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const status = statuses[c.id] || "open";
                    const isRevealed = !namesMaskedByDefault || revealed[c.id];
                    const displayName = isRevealed ? c.studentName : maskName(c.studentName);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-medium">{displayName}</div>
                              {!namesMaskedByDefault && (
                                <div className="text-xs text-muted-foreground">
                                  with {c.instructorName}
                                </div>
                              )}
                            </div>
                            {namesMaskedByDefault && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={!canReveal}
                                    onClick={() => toggleReveal(c.id)}
                                  >
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  {canReveal
                                    ? (isRevealed ? "Hide identity" : "Reveal identity (logged for audit)")
                                    : "Reveal requires advisor / instructor-of-record / support-staff role (FERPA)."}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className={`${tierMeta[c.tier].cls} cursor-help gap-1`}>
                                {tierMeta[c.tier].label}
                                <Info className="w-3 h-3" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="text-xs space-y-1">
                                <div className="font-semibold">How this is computed</div>
                                {c.signals.map((s, i) => (
                                  <div key={i}>
                                    • {s.label} <span className="opacity-70">(+{s.weight})</span>
                                  </div>
                                ))}
                                <div className="pt-1 border-t opacity-80">
                                  Score {c.score} · Critical ≥6 · High ≥4 · Medium ≥2
                                </div>
                                <div className="pt-1 opacity-80">
                                  Grades are not used as inputs.
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {c.signals.map((s, i) => (
                              <Badge key={i} variant="outline" className="text-xs font-normal">
                                {s.label}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{c.suggestedAction}</TableCell>
                        <TableCell>
                          <Select
                            value={status}
                            onValueChange={(v) => setStatus(c.id, v as CaseStatus)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
