import { ShieldCheck, Lock } from "lucide-react";

export default function GovernanceBanner() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">Behavioral signals only. </span>
          <span className="text-muted-foreground">
            Risk flags use participation, response rate, and activity. No race, gender, age, or any
            demographic variable is used as an input.
          </span>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">FERPA role-scoped. </span>
          <span className="text-muted-foreground">
            Individual student records are limited to staff with documented legitimate educational
            interest (FERPA §99.31). Aggregate counts are visible to all admins.
          </span>
        </div>
      </div>
    </div>
  );
}
