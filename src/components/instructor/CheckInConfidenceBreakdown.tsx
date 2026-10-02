/** Confidence choices students made on an MCQ check-in: overall split + who picked what. */
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge } from "lucide-react";

export interface ConfidenceRow {
  student_id: string;
  student_name?: string;
  confidence_level?: string | null;
  grade: number | null;
  completed: boolean;
}

const LEVELS = [
  { key: "low", label: "Not Sure", color: "hsl(var(--muted-foreground))" },
  { key: "medium", label: "Fairly Sure", color: "hsl(var(--primary))" },
  { key: "high", label: "Confident", color: "hsl(38 92% 50%)" },
  { key: "very_high", label: "Absolutely Sure", color: "hsl(0 72% 51%)" },
] as const;

export function CheckInConfidenceBreakdown({ rows }: { rows: ConfidenceRow[] }) {
  // One entry per student (latest answered row wins)
  const byStudent = new Map<string, ConfidenceRow>();
  for (const r of rows) if (r.confidence_level) byStudent.set(r.student_id, r);
  const picked = [...byStudent.values()];
  if (picked.length === 0) return null;

  const data = LEVELS.map((l) => {
    const students = picked.filter((p) => p.confidence_level === l.key);
    const correct = students.filter((s) => (s.grade ?? 0) >= 100).length;
    return { ...l, count: students.length, correct, incorrect: students.length - correct, students };
  });

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Student confidence</h4>
        <span className="text-xs text-muted-foreground">({picked.length} answered with a confidence bet)</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">All choices</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.filter((d) => d.count > 0)} dataKey="count" nameKey="label" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {data.filter((d) => d.count > 0).map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v} student(s)`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {data.map((d) => (
              <span key={d.key} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                {d.label}: {d.count}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Correct vs incorrect by confidence</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: -20 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="correct" name="Correct" stackId="a" fill="hsl(var(--primary))" />
                <Bar dataKey="incorrect" name="Incorrect" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Who chose which confidence</p>
        {data.map((d) => (
          <div key={d.key} className="flex items-start gap-3">
            <span className="w-32 shrink-0 text-xs font-medium inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <div className="flex-1">
              <div className="h-2 rounded bg-muted overflow-hidden mb-1.5">
                <div className="h-full" style={{ width: `${(d.count / picked.length) * 100}%`, background: d.color }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {d.students.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {d.students.map((s) => {
                  const ok = (s.grade ?? 0) >= 100;
                  return (
                    <span
                      key={s.student_id}
                      className={`text-xs rounded px-1.5 py-0.5 border ${ok ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive"}`}
                      title={ok ? "Correct" : "Incorrect"}
                    >
                      {s.student_name ?? "Student"} {ok ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
