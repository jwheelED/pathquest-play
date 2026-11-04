import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Building2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { getOrgBillingSummary, type OrgBillingSummary } from "@/lib/billingRpc";
import { topUpRateForTier } from "@/lib/billingConfig";

/**
 * Institutional (Path 1) hour-pool usage for the admin's org.
 *
 * Tracking + visibility only — going over the pool is NOT blocked. Overage is
 * surfaced here and billed manually at renewal. Renders nothing if the org has
 * no institutional plan / pool.
 */
export function InstitutionalUsageCard() {
  const [summary, setSummary] = useState<OrgBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgBillingSummary()
      .then(setSummary)
      .catch((e) => console.error("Failed to load org billing summary:", e))
      .finally(() => setLoading(false));
  }, []);

  // Render nothing until we know the org has an institutional plan, so the
  // majority of (non-institutional) admins never see a flash of empty card.
  if (loading || !summary) return null;

  const includedMinutes = summary.included_minutes ?? 0;
  const usedMinutes = summary.used_minutes ?? 0;
  const includedHours = includedMinutes / 60;
  const usedHours = usedMinutes / 60;
  const percent = includedMinutes > 0 ? Math.min(100, Math.round((usedMinutes / includedMinutes) * 100)) : 0;
  const isOver = usedMinutes > includedMinutes;

  const overageHours = isOver ? usedHours - includedHours : 0;
  const rate = topUpRateForTier(summary.tier_name);
  const overageCost = rate != null ? overageHours * rate : null;

  const fmtHours = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {summary.tier_display || "Institutional"} Plan — Hour Pool
            </CardTitle>
            <CardDescription>
              Shared lecture hours across your organization
              {summary.period_end && (
                <> · resets {format(new Date(summary.period_end), "MMM d, yyyy")}</>
              )}
            </CardDescription>
          </div>
          {isOver ? (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              Over pool
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-primary/10 text-primary shrink-0">
              {percent}% used
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-bold">
              {fmtHours(usedHours)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {fmtHours(includedHours)} hours
              </span>
            </span>
          </div>
          <Progress value={percent} className={isOver ? "[&>div]:bg-amber-500" : undefined} />
        </div>

        {isOver && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {fmtHours(overageHours)} hours over your annual pool
              </p>
              <p className="text-amber-600 dark:text-amber-500">
                {overageCost != null ? (
                  <>Approx. ${overageCost.toFixed(2)} in overage at ${rate}/hr. </>
                ) : null}
                Overage is invoiced manually at renewal — sessions are never blocked.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
