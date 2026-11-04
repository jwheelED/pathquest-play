interface ConfidenceRowProps {
  selected: number | null;
  onSelect: (level: number) => void;
}

const levels = [
  { label: "Not sure", dots: 1, value: 1 },
  { label: "Think so", dots: 2, value: 2 },
  { label: "Confident", dots: 3, value: 3 },
  { label: "Certain", dots: 4, value: 4 },
];

export function ConfidenceRow({ selected, onSelect }: ConfidenceRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-[hsl(var(--ink))]">How sure are you?</span>
      <div className="grid grid-cols-4 gap-2">
        {levels.map((level) => {
          const isSelected = selected === level.value;
          return (
            <button
              key={level.value}
              onClick={() => onSelect(level.value)}
              className={`h-11 rounded-xl text-sm font-medium transition-all duration-200 flex flex-col items-center justify-center gap-0.5 ${
                isSelected
                  ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] text-[hsl(var(--emerald-800))]"
                  : "border border-[hsl(var(--slate-200))] bg-white text-[hsl(var(--text-muted-live))] hover:bg-[hsl(var(--slate-50))]"
              }`}
            >
              <span className="text-xs">{level.label}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 h-1 rounded-full ${
                      i < level.dots
                        ? isSelected
                          ? "bg-[hsl(var(--primary))]"
                          : "bg-[hsl(var(--slate-400))]"
                        : "bg-[hsl(var(--slate-200))]"
                    }`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
