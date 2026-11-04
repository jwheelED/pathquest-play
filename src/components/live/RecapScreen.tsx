import { CheckCircle2, RefreshCw, Bookmark } from "lucide-react";
import type { RecapItem } from "./useSessionState";

interface RecapScreenProps {
  title: string;
  items: RecapItem[];
}

export function RecapScreen({ title, items }: RecapScreenProps) {
  const correct = items.filter((i) => i.wasCorrect);
  const misconceptions = items.filter((i) => !i.wasCorrect);
  const changedMind = items.filter((i) => i.changedMind);

  return (
    <div className="w-full max-w-[780px] mx-auto py-8 px-4 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--text-subtle))]">
          What changed today
        </span>
        <h1 className="text-[36px] font-bold tracking-[-0.02em] text-[hsl(var(--ink))]">
          {title || "Session Recap"}
        </h1>
      </div>

      {/* 2x2 card grid */}
      <div className="grid grid-cols-2 gap-3">
        <RecapCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Strong"
          value={`${correct.length}`}
          color="emerald"
        />
        <RecapCard
          icon={<RefreshCw className="w-5 h-5" />}
          label="Misconception corrected"
          value={`${misconceptions.length}`}
          color="sky"
        />
        <RecapCard
          icon={<span className="text-[40px] font-bold leading-none text-[hsl(var(--primary))]">{changedMind.length}×</span>}
          label="You changed your mind"
          value=""
          color="emerald"
          large
        />
        <RecapCard
          icon={<Bookmark className="w-5 h-5" />}
          label="Worth another look"
          value={`${misconceptions.length}`}
          color="amber"
        />
      </div>

      {/* Survey strip */}
      <div className="flex flex-col items-center gap-3 p-5 border border-dashed border-[hsl(var(--slate-300))] rounded-[var(--radius-xl)]">
        <p className="text-sm text-[hsl(var(--text-muted-live))]">
          Would you want Edvana used again next class?
        </p>
        <div className="flex gap-2">
          {["Definitely", "Probably", "Neutral", "Not really"].map((opt) => (
            <button
              key={opt}
              className="px-4 py-2 rounded-full text-sm border border-[hsl(var(--slate-200))] bg-white hover:bg-[hsl(var(--slate-50))] text-[hsl(var(--ink))] transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecapCard({
  icon,
  label,
  value,
  color,
  large,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "sky" | "amber";
  large?: boolean;
}) {
  const colorMap = {
    emerald: {
      bg: "bg-[hsl(var(--emerald-50))]",
      border: "border-[hsl(var(--emerald-100))]",
      icon: "text-[hsl(var(--emerald-600))]",
    },
    sky: {
      bg: "bg-[hsl(var(--sky-50))]",
      border: "border-[hsl(var(--sky-100))]",
      icon: "text-[hsl(var(--sky-500))]",
    },
    amber: {
      bg: "bg-[hsl(45_93%_96%)]",
      border: "border-[hsl(45_80%_85%)]",
      icon: "text-[hsl(var(--amber-strong))]",
    },
  };

  const c = colorMap[color];

  return (
    <div className={`flex flex-col gap-2 p-4 rounded-[var(--radius-xl)] border ${c.bg} ${c.border}`}>
      <div className={c.icon}>{icon}</div>
      {!large && <span className="text-2xl font-bold text-[hsl(var(--ink))]">{value}</span>}
      <span className="text-sm text-[hsl(var(--text-muted-live))]">{label}</span>
    </div>
  );
}
