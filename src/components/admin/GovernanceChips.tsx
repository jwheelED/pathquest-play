import { Shield } from "lucide-react";

const CHIPS = [
  "Aggregate only",
  "Formative",
  "Not faculty evaluation",
  "Role-scoped",
];

export default function GovernanceChips() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <Shield className="w-4 h-4 text-muted-foreground" />
      {CHIPS.map((label) => (
        <span
          key={label}
          className="text-xs font-medium px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
